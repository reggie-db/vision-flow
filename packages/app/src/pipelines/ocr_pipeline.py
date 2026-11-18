"""Continuously extract schema-pinned OCR images into one Delta table."""

import base64
import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Iterable, Iterator

import requests
from databricks.sdk import WorkspaceClient
from psycopg import sql
from psycopg_pool import ConnectionPool
from pyspark import pipelines as dp
from pyspark.sql import DataFrame, Row
from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, BooleanType, IntegerType, StringType, StructField, StructType, TimestampType

VOLUME_FULL_NAME = spark.conf.get("ocr.volume")
MODEL_SERVICE = spark.conf.get("ocr.model_service")
LAKEBASE_ENDPOINT = spark.conf.get("ocr.lakebase_endpoint")
LAKEBASE_DATABASE = spark.conf.get("ocr.lakebase_database")
LAKEBASE_ROLE = spark.conf.get("ocr.lakebase_role")
SECRET_SCOPE = spark.conf.get("ocr.secret_scope")
PASSWORD_KEY = spark.conf.get("ocr.password_key")
META_SCHEMA = spark.conf.get("ocr.meta_schema")
GENIE_CATALOG = spark.conf.get("ocr.genie_catalog")
GENIE_SCHEMA = spark.conf.get("ocr.genie_schema")
DOCUMENTS_TABLE = spark.conf.get("ocr.documents_table")
REVIEW_THRESHOLD = float(spark.conf.get("ocr.review_threshold"))
SCHEMA_CACHE_SIZE = int(spark.conf.get("ocr.worker_schema_cache_size"))
POOL_CACHE_SIZE = int(spark.conf.get("ocr.worker_pool_cache_size"))
VOLUME_PATH = f"/Volumes/{VOLUME_FULL_NAME.replace('.', '/')}"
_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,95}$")


def _endpoint_host() -> str:
    endpoint = WorkspaceClient().postgres.get_endpoint(LAKEBASE_ENDPOINT)
    host = endpoint.status.hosts.host if endpoint.status and endpoint.status.hosts else None
    if not host:
        raise RuntimeError(f"Lakebase endpoint has no active host: {LAKEBASE_ENDPOINT}")
    return host


PG_HOST = _endpoint_host()
PG_PASSWORD = dbutils.secrets.get(SECRET_SCOPE, PASSWORD_KEY)


def _safe_identifier(value: str) -> str:
    if not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"Unsafe identifier: {value}")
    return value


def _quoted_identifier(value: str) -> str:
    return f"`{value.replace('`', '``')}`"


def _documents_relation() -> str:
    return ".".join(_quoted_identifier(value) for value in (GENIE_CATALOG, GENIE_SCHEMA, DOCUMENTS_TABLE))


@lru_cache(maxsize=POOL_CACHE_SIZE)
def _pool(host: str, database: str, role: str, password: str) -> ConnectionPool:
    conninfo = (
        f"host={host} port=5432 dbname={database} user={role} "
        f"password={password} sslmode=require application_name=vision_flow_pipeline "
        f"options='-c role={role}'"
    )
    return ConnectionPool(conninfo=conninfo, min_size=0, max_size=1, open=True)


@lru_cache(maxsize=SCHEMA_CACHE_SIZE)
def _schema(host: str, database: str, role: str, password: str, slug: str, version: int) -> dict[str, Any]:
    _safe_identifier(slug)
    with _pool(host, database, role, password).connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                sql.SQL(
                    """
                    SELECT c.id, sv.fingerprint, sv.contract, sv.extraction_schema
                      FROM {}.categories c
                      JOIN {}.schema_versions sv
                        ON sv.category_id = c.id
                     WHERE c.slug = %s AND sv.version = %s
                    """
                ).format(sql.Identifier(META_SCHEMA), sql.Identifier(META_SCHEMA)),
                (slug, version),
            )
            row = cursor.fetchone()
    if not row:
        raise LookupError(f"No OCR schema for {slug} v{version}")
    return {"category_id": str(row[0]), "fingerprint": row[1], "contract": row[2], "extraction_schema": row[3]}


@lru_cache(maxsize=1)
def _gateway() -> tuple[str, dict[str, str]]:
    workspace = WorkspaceClient()
    return workspace.config.host.rstrip("/"), {**workspace.config.authenticate(), "Content-Type": "application/json"}


def _response_text(payload: dict[str, Any]) -> str:
    return "".join(
        part.get("text", "")
        for output in payload.get("output", [])
        for part in output.get("content", [])
        if isinstance(part, dict)
    ).strip()


def _extract(image: bytes, extension: str, schema: dict[str, Any]) -> dict[str, Any]:
    host, headers = _gateway()
    mime_type = "image/png" if extension == "png" else "image/jpeg"
    image_url = f"data:{mime_type};base64,{base64.b64encode(image).decode('ascii')}"
    prompt = "\n".join(
        [
            "Extract this image using the supplied immutable OCR schema.",
            "Return only facts visible in the image and do not infer hidden values.",
            "generic_description must be a concise, domain-neutral description suitable for full-text search.",
            "full_text must transcribe all legible text in reading order.",
            "Set document_type_match false when the image does not satisfy the schema intent.",
            f"Contract: {json.dumps(schema['contract'], separators=(',', ':'))}",
        ]
    )
    response = requests.post(
        f"{host}/ai-gateway/mlflow/v1/responses",
        headers=headers,
        json={
            "model": MODEL_SERVICE,
            "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}, {"type": "input_image", "image_url": image_url}]}],
            "text": {"format": {"type": "json_schema", "name": "ocr_document_extraction", "strict": True, "schema": schema["extraction_schema"]}},
            "max_output_tokens": 8192,
            "reasoning": {"effort": "medium"},
        },
        timeout=120,
    )
    response.raise_for_status()
    return json.loads(_response_text(response.json()))


def _field_envelopes(value: Any) -> Iterator[dict[str, Any]]:
    if isinstance(value, dict):
        if {"value", "confidence", "evidence"}.issubset(value):
            yield value
        for nested in value.values():
            yield from _field_envelopes(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _field_envelopes(nested)


def _field_present(value: Any) -> bool:
    if isinstance(value, dict) and "value" in value:
        return value.get("value") not in (None, "", [])
    if isinstance(value, list):
        return len(value) > 0
    return value not in (None, "", [])


def _required_missing(payload: dict[str, Any], contract: dict[str, Any]) -> list[str]:
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    return [field["name"] for field in contract.get("fields", []) if field.get("required") and not _field_present(fields.get(field["name"]))]


def _search_fragments(value: Any) -> Iterator[str]:
    if isinstance(value, dict):
        for key, nested in value.items():
            if key != "confidence":
                yield from _search_fragments(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from _search_fragments(nested)
    elif value is not None:
        yield str(value)


def _processed_row(row: Row, host: str, password: str) -> dict[str, Any]:
    document_id = row.document_id
    slug = _safe_identifier(row.schema_slug)
    version = int(row.schema_version)
    processed_at = datetime.now(timezone.utc)
    schema_id = None
    category_id = None
    try:
        schema = _schema(host, LAKEBASE_DATABASE, LAKEBASE_ROLE, password, slug, version)
        schema_id = schema["fingerprint"]
        category_id = schema["category_id"]
        payload = _extract(bytes(row.content), row.file_extension, schema)
        warnings = [str(item) for item in payload.get("warnings", [])]
        missing = _required_missing(payload, schema["contract"])
        if missing:
            warnings.append(f"Missing required fields: {', '.join(missing)}")
        confidences = [
            float(envelope["confidence"])
            for envelope in _field_envelopes(payload.get("fields", {}))
            if isinstance(envelope.get("confidence"), (int, float))
        ]
        low_confidence = any(value < REVIEW_THRESHOLD for value in confidences)
        document_type_match = bool(payload.get("document_type_match"))
        generic_description = str(payload.get("generic_description") or "").strip()
        if not generic_description:
            generic_description = "Scanned image containing structured fields and visible text."
            warnings.append("The model did not return a generic description; a fallback was stored.")
        full_text = str(payload.get("full_text") or "").strip()
        search_text = "\n".join(
            fragment.strip()
            for fragment in [generic_description, full_text, *list(_search_fragments(payload.get("fields", {})))]
            if fragment and fragment.strip()
        )
        return {
            "document_id": document_id,
            "schema_id": schema_id,
            "category_id": category_id,
            "schema_version": version,
            "schema_slug": slug,
            "source_path": row.path,
            "processing_status": "completed",
            "document_type_match": document_type_match,
            "needs_review": (not document_type_match) or bool(missing) or low_confidence,
            "generic_description": generic_description,
            "full_text": full_text,
            "search_text": search_text,
            "payload_json": json.dumps(payload, separators=(",", ":")),
            "warnings": warnings,
            "error": None,
            "model_service": MODEL_SERVICE,
            "processed_at": processed_at,
        }
    except Exception as error:
        return {
            "document_id": document_id,
            "schema_id": schema_id,
            "category_id": category_id,
            "schema_version": version,
            "schema_slug": slug,
            "source_path": row.path,
            "processing_status": "failed",
            "document_type_match": False,
            "needs_review": True,
            "generic_description": "Scanned image that could not be processed.",
            "full_text": "",
            "search_text": "Scanned image that could not be processed.",
            "payload_json": None,
            "warnings": [],
            "error": str(error)[:4000],
            "model_service": MODEL_SERVICE,
            "processed_at": processed_at,
        }


def _process_partition(rows: Iterable[Row], host: str, password: str) -> Iterator[dict[str, Any]]:
    for row in rows:
        yield _processed_row(row, host, password)


RESULT_SCHEMA = StructType(
    [
        StructField("document_id", StringType(), False),
        StructField("schema_id", StringType(), True),
        StructField("category_id", StringType(), True),
        StructField("schema_version", IntegerType(), False),
        StructField("schema_slug", StringType(), False),
        StructField("source_path", StringType(), False),
        StructField("processing_status", StringType(), False),
        StructField("document_type_match", BooleanType(), False),
        StructField("needs_review", BooleanType(), False),
        StructField("generic_description", StringType(), False),
        StructField("full_text", StringType(), False),
        StructField("search_text", StringType(), False),
        StructField("payload_json", StringType(), True),
        StructField("warnings", ArrayType(StringType(), False), False),
        StructField("error", StringType(), True),
        StructField("model_service", StringType(), False),
        StructField("processed_at", TimestampType(), False),
    ]
)


def _merge_documents(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    view_name = "_ocr_document_batch"
    spark.createDataFrame(rows, schema=RESULT_SCHEMA).createOrReplaceTempView(view_name)
    try:
        spark.sql(
            f"""
            MERGE INTO {_documents_relation()} AS target
            USING (
              SELECT document_id, schema_id, category_id, schema_version, schema_slug, source_path,
                     processing_status, document_type_match, needs_review, generic_description, full_text,
                     search_text,
                     CASE WHEN payload_json IS NULL THEN CAST(NULL AS VARIANT) ELSE parse_json(payload_json) END AS payload,
                     warnings, error, model_service, processed_at
                FROM {_quoted_identifier(view_name)}
            ) AS source
            ON target.document_id = source.document_id
            WHEN MATCHED THEN UPDATE SET *
            WHEN NOT MATCHED THEN INSERT *
            """
        )
    finally:
        spark.sql(f"DROP VIEW IF EXISTS {_quoted_identifier(view_name)}")


@dp.table(
    name="ocr_images_bronze",
    comment="Immutable schema/version-pinned OCR images incrementally discovered from the Unity Catalog volume.",
    table_properties={"quality": "bronze", "delta.enableRowTracking": "true"},
)
@dp.expect_or_drop("supported_image", "lower(file_extension) IN ('jpg', 'jpeg', 'png')")
@dp.expect_or_drop("valid_schema_path", "schema_slug <> '' AND schema_version IS NOT NULL AND document_id <> ''")
def ocr_images_bronze() -> DataFrame:
    relative = F.regexp_extract("path", rf"{re.escape(VOLUME_PATH)}/(.+)$", 1)
    return (
        spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "binaryFile")
        .option("cloudFiles.includeExistingFiles", "true")
        .option("recursiveFileLookup", "true")
        .load(VOLUME_PATH)
        .withColumn("relative_path", relative)
        .withColumn("schema_slug", F.regexp_extract("relative_path", r"^([a-z][a-z0-9_]*)/", 1))
        .withColumn("schema_version", F.regexp_extract("relative_path", r"^[^/]+/v([0-9]+)/", 1).cast("int"))
        .withColumn("file_name", F.element_at(F.split("path", "/"), -1))
        .withColumn("file_extension", F.lower(F.element_at(F.split("file_name", r"\."), -1)))
        .withColumn("document_id", F.regexp_extract("file_name", r"^([0-9a-fA-F-]{36})\.", 1))
        .withColumnRenamed("modificationTime", "modification_time")
        .withColumn("ingested_at", F.current_timestamp())
        .select("document_id", "schema_slug", "schema_version", "path", "file_name", "file_extension", "modification_time", "length", "content", "ingested_at")
    )


@dp.foreach_batch_sink(name="ocr_document_sink")
def ocr_document_sink(batch: DataFrame, batch_id: int) -> None:
    del batch_id
    _merge_documents(list(_process_partition(batch.collect(), PG_HOST, PG_PASSWORD)))


@dp.append_flow(target="ocr_document_sink")
def ocr_document_flow() -> DataFrame:
    return spark.readStream.table("ocr_images_bronze")
