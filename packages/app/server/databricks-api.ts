import { client } from '@dbx-tools/auth';

export class DatabricksApiError extends Error {
  public constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DatabricksApiError';
  }
}

export async function databricksFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = await client.createAuthClient();
  return fetch(`${auth.host.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      ...(await auth.headers()),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export async function databricksJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await databricksFetch(path, init);
  if (!response.ok) {
    throw new DatabricksApiError(
      response.status,
      `Databricks request failed (${response.status}): ${(await response.text()).slice(0, 1_000)}`
    );
  }
  return (await response.json()) as T;
}
