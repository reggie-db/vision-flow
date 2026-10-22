import { z } from 'zod';
import { config } from './config.ts';
import { databricksJson } from './databricks-api.ts';

const StatementSchema = z.object({
  statement_id: z.string(),
  status: z.object({
    state: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'CLOSED']),
    error: z.object({ message: z.string().optional() }).optional(),
  }),
});

type Statement = z.infer<typeof StatementSchema>;

function quoteSqlIdentifier(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``;
}

async function statement(statement: string): Promise<Statement> {
  return StatementSchema.parse(
    await databricksJson('/api/2.0/sql/statements', {
      method: 'POST',
      body: JSON.stringify({
        warehouse_id: config.genieWarehouseId,
        catalog: config.genieCatalog,
        schema: config.genieSchema,
        statement,
        wait_timeout: '10s',
        on_wait_timeout: 'CONTINUE',
        row_limit: 1,
      }),
      signal: AbortSignal.timeout(20_000),
    }),
  );
}

async function poll(statementId: string): Promise<Statement> {
  return StatementSchema.parse(
    await databricksJson(`/api/2.0/sql/statements/${encodeURIComponent(statementId)}`, {
      signal: AbortSignal.timeout(15_000),
    }),
  );
}

async function waitForStatement(current: Statement): Promise<void> {
  while (current.status.state === 'PENDING' || current.status.state === 'RUNNING') {
    await delay(1_000);
    current = await poll(current.statement_id);
  }
  if (current.status.state !== 'SUCCEEDED') {
    throw new Error(current.status.error?.message ?? `SQL statement ended in ${current.status.state}.`);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForUcTable(tableName: string, timeoutMs = 180_000): Promise<void> {
  const identifier = [config.genieCatalog, config.genieSchema, tableName].map(quoteSqlIdentifier).join('.');
  const expiresAt = Date.now() + timeoutMs;
  let lastError = 'Table is not visible yet.';
  while (Date.now() < expiresAt) {
    try {
      await waitForStatement(await statement(`SELECT * FROM ${identifier} LIMIT 0`));
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(2_000);
  }
  throw new Error(`Unity Catalog did not expose ${identifier} within ${timeoutMs / 1_000} seconds: ${lastError}`);
}

export async function executeUcStatements(statements: string[]): Promise<void> {
  for (const sql of statements) {
    try {
      await waitForStatement(await statement(sql));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unity Catalog statement failed: ${sql.slice(0, 240)}\n${message}`);
    }
  }
}

export async function executeWarehouseSql(sql: string): Promise<void> {
  try {
    await waitForStatement(await statement(sql));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Dashboard SQL validation failed: ${sql.slice(0, 240)}\n${message}`);
  }
}
