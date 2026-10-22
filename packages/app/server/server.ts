import { files, server } from '@databricks/appkit';
import { appkit } from '@dbx-tools/appkit';
import { agents, genie, mastra } from '@dbx-tools/appkit-mastra';
import { email } from '@dbx-tools/email';
import { log, toError } from '@dbx-tools/shared-core';
import { authGate } from '@dbx-tools/tunnel';
import { z } from 'zod';
import {
  CategoryDeleteRequestSchema,
  CategoryRenameRequestSchema,
  CategoryResolveRequestSchema,
  ImageUploadRequestSchema,
  type OperationEvent,
  type UploadResponse,
} from '../shared/ocr-contracts.ts';
import {
  deleteCategoryAndRefresh,
  ensureDefaultCategory,
  provisionCategoryFromPrompt,
  renameCategoryAndRefresh,
} from './category-provisioner.ts';
import { config } from './config.ts';
import { database } from './database.ts';
import { migrateRegistry } from './migrations.ts';
import { quickImageGate } from './model-gateway.ts';
import {
  createOperation,
  listOperationEvents,
  subscribeOperation,
} from './operations.ts';
import { deletePrompt, getCategory, getSchemaVersion, listCategories } from './registry.ts';

const ALLOWED_EMAIL_DOMAINS = ['@databricks.com', '@gulfinc.com'];
const TUNNEL_ENABLED = Boolean(process.env.TUNNEL_PUBLIC_DOMAIN);
const logger = log.logger('dynamic-ocr');
const UuidSchema = z.string().uuid();
const mastraPostgres = {
  host: config.pgHost,
  port: config.pgPort,
  database: config.lakebaseDatabase,
  user: config.pgUser,
  password: config.pgPassword,
  ssl: config.pgSslMode === 'disable' ? false : { rejectUnauthorized: true },
  max: 4,
  idleTimeoutMillis: 30_000,
};
const ocrDataAssistant = agents.createAgent({
  name: 'Dynamic OCR data assistant',
  description: 'Answers questions about schema-defined OCR results published to the curated Genie space.',
  instructions: [
    'You answer questions about scans processed by the Dynamic OCR application.',
    'Use the configured Genie tools for every question about scanned images, counts, nested fields, confidence, review status, or processing results.',
    'Use the OCR schema registry view to discover the correct payload field path before querying schema-specific values.',
    'Treat Genie and its generated SQL as the source of truth. Never invent rows, field values, scan outcomes, or processing status.',
    'State when the available tables do not contain enough information. Mention review flags or low-confidence fields when they affect the answer.',
    genie.GENIE_INSTRUCTIONS,
  ].join('\n\n'),
  async tools(plugins) {
    const genieTools = await plugins.genie?.toolkit({ prefix: '' });
    return { ...(genieTools ?? {}) };
  },
  storage: { ...mastraPostgres, schemaName: 'mastra_ocr_data' },
  memory: { ...mastraPostgres, schemaName: 'mastra_ocr_memory' },
});

interface EncodedImage {
  contents: Buffer;
  extension: 'jpg' | 'png';
}

function decodeImageDataUrl(imageDataUrl: string): EncodedImage {
  const [metadata, encoded] = imageDataUrl.split(',', 2);
  if (!metadata || !encoded) throw new Error('The captured image is incomplete.');
  return {
    contents: Buffer.from(encoded, 'base64'),
    extension: metadata.includes('image/png') ? 'png' : 'jpg',
  };
}

function uploadPath(slug: string, schemaVersion: number, uploadId: string, extension: EncodedImage['extension']): string {
  const capturedAt = new Date();
  const datePath = [
    capturedAt.getUTCFullYear(),
    String(capturedAt.getUTCMonth() + 1).padStart(2, '0'),
    String(capturedAt.getUTCDate()).padStart(2, '0'),
  ].join('/');
  return `${slug}/v${schemaVersion}/${datePath}/${uploadId}.${extension}`;
}

function sendSse(response: { write(chunk: string): boolean }, event: OperationEvent): void {
  response.write(`id: ${event.sequence}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`);
}

await migrateRegistry(database);
await ensureDefaultCategory();

await appkit.createApp({
  plugins: [
    server({ bodyLimit: '11mb', staticPath: 'client/dist' }),
    ...(TUNNEL_ENABLED
      ? [
          email(),
          authGate({
            allow: ALLOWED_EMAIL_DOMAINS,
            brandName: 'Dynamic OCR',
            gatePaths: ['/'],
          }),
        ]
      : []),
    files({
      volumes: {
        files: {
          maxUploadSize: 6_000_000,
          policy: files.policy.allowAll(),
        },
      },
    }),
    mastra({
      agents: { ocr_data: ocrDataAssistant },
      defaultAgent: 'ocr_data',
      backgroundTurns: false,
      storage: { id: 'dynamic-ocr-mastra', ...mastraPostgres, schemaName: 'mastra_instance' },
      memory: false,
      genieIdentity: config.mastraGenieIdentity,
      genieSpaces: {
        default: {
          spaceId: config.genieSpaceId,
          hint: 'schema-defined OCR scans, nested payload fields, schema context, full text, confidence, review status, and processing metadata',
        },
      },
    }),
  ],
  onPluginsReady(app) {
    app.server.extend((http) => {
      http.use((request, response, next) => {
        if (request.path === '/' || request.path.endsWith('.html')) {
          response.setHeader('Cache-Control', 'no-store, max-age=0');
          response.setHeader('Pragma', 'no-cache');
          response.setHeader('Expires', '0');
        }
        next();
      });

      http.get('/api/whoami', (request, response) => {
        const user =
          request.header('x-forwarded-email') ??
          request.header('x-forwarded-user') ??
          request.header('x-databricks-user') ??
          'Local Databricks profile';
        response.json({ user, executionIdentity: config.mastraGenieIdentity });
      });

      http.get('/api/categories', async (_request, response) => {
        response.json({ categories: await listCategories() });
      });

      http.post('/api/categories/resolve', async (request, response) => {
        const parsed = CategoryResolveRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          response.status(400).json({ error: 'Describe the image and fields to extract.' });
          return;
        }
        const operation = await createOperation(parsed.data.prompt, parsed.data.idempotencyKey);
        if (operation.created) {
          void provisionCategoryFromPrompt(operation.id, parsed.data.prompt, parsed.data.displayName).catch((error) => {
            logger.error('category provisioning failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.patch('/api/categories/:categoryId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = CategoryRenameRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A schema and valid name are required.' });
          return;
        }
        const operation = createOperation(
          `Rename schema ${categoryId.data}`,
          `rename:${categoryId.data}:${parsed.data.idempotencyKey}`,
        );
        if (operation.created) {
          void renameCategoryAndRefresh(operation.id, categoryId.data, parsed.data.displayName).catch((error) => {
            logger.error('category rename failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.delete('/api/categories/:categoryId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = CategoryDeleteRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A schema and idempotency key are required.' });
          return;
        }
        const operation = createOperation(
          `Delete schema ${categoryId.data}`,
          `delete:${categoryId.data}:${parsed.data.idempotencyKey}`,
        );
        if (operation.created) {
          void deleteCategoryAndRefresh(operation.id, categoryId.data).catch((error) => {
            logger.error('category deletion failed', { error: toError(error), operationId: operation.id });
          });
        }
        response.status(operation.created ? 202 : 200).json({ operationId: operation.id });
      });

      http.get('/api/operations/:operationId/events', async (request, response) => {
        const operationId = UuidSchema.safeParse(request.params.operationId);
        if (!operationId.success) {
          response.status(400).json({ error: 'A valid operation ID is required.' });
          return;
        }
        response.status(200);
        response.setHeader('Content-Type', 'text/event-stream');
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Connection', 'keep-alive');
        response.flushHeaders();

        const headerId = Number(request.header('last-event-id') ?? 0);
        const queryId = Number(request.query.after ?? 0);
        let terminal = false;
        for (const event of await listOperationEvents(operationId.data, Math.max(headerId, queryId))) {
          sendSse(response, event);
          terminal ||= event.stage === 'ready' || event.stage === 'failed';
        }
        if (terminal) {
          response.end();
          return;
        }

        const unsubscribe = subscribeOperation(operationId.data, (event) => {
          sendSse(response, event);
          if (event.stage === 'ready' || event.stage === 'failed') response.end();
        });
        const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 15_000);
        request.on('close', () => {
          clearInterval(heartbeat);
          unsubscribe();
        });
      });

      http.delete('/api/categories/:categoryId/prompts/:promptId', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const promptId = UuidSchema.safeParse(request.params.promptId);
        if (!categoryId.success || !promptId.success) {
          response.status(400).json({ error: 'Valid category and prompt IDs are required.' });
          return;
        }
        const deleted = await deletePrompt(categoryId.data, promptId.data);
        response.status(deleted ? 204 : 404).end();
      });

      http.post('/api/categories/:categoryId/uploads', async (request, response) => {
        const categoryId = UuidSchema.safeParse(request.params.categoryId);
        const parsed = ImageUploadRequestSchema.safeParse(request.body);
        if (!categoryId.success || !parsed.success) {
          response.status(400).json({ error: 'A valid category and supported captured image are required.' });
          return;
        }
        try {
          const category = await getCategory(categoryId.data);
          if (!category || category.status !== 'ready') {
            response.status(409).json({ error: 'The selected category is not ready.' });
            return;
          }
          const schemaVersion = parsed.data.schemaVersion ?? category.activeSchemaVersion;
          const schema = await getSchemaVersion(category.id, schemaVersion);
          if (!schema) {
            response.status(409).json({ error: 'The selected category schema version is unavailable.' });
            return;
          }

          const gate = await quickImageGate(
            parsed.data.quickImageDataUrl ?? parsed.data.imageDataUrl,
            category.displayName,
            category.description,
            schema.contract,
          );
          if (!gate.valid) {
            const result: UploadResponse = { status: 'rejected', gate };
            response.json(result);
            return;
          }

          const image = decodeImageDataUrl(parsed.data.imageDataUrl);
          const uploadId = crypto.randomUUID();
          const storedPath = uploadPath(category.slug, schemaVersion, uploadId, image.extension);
          await app.files('files').upload(storedPath, image.contents, { overwrite: false });
          const result: UploadResponse = { status: 'queued', uploadId, storedPath, gate };
          response.status(202).json(result);
        } catch (error) {
          logger.error('image validation failed', { error: toError(error) });
          response.status(502).json({ error: 'The image could not be checked and queued. Try again.' });
        }
      });
    });
  },
});
