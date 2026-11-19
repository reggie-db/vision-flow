import { postgresConnectionOptions } from '@dbx-tools/postgres';
import { Pool } from 'pg';
import { config } from './config.ts';

export const database = new Pool(
  postgresConnectionOptions(
    {
      host: config.pgHost,
      port: config.pgPort,
      database: config.lakebaseDatabase,
      user: config.pgUser,
      password: config.pgPassword,
      ssl: config.pgSslMode === 'disable' ? false : { rejectUnauthorized: true },
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 20_000,
      keepAlive: true,
    },
    config.lakebaseRole
  )
);
