import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { databaseConfig } from './database.config';

const scripts = ['01_schema.sql', '02_logic.sql', '03_seed.sql'];

async function initializeDatabase(): Promise<void> {
  const client = new Client(databaseConfig());

  try {
    await client.connect();
    await client.query('BEGIN');

    for (const script of scripts) {
      try {
        const sql = await readFile(resolve(__dirname, '../../../db', script), 'utf8');
        await client.query(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${script}: ${message}`, { cause: error });
      }
    }

    await client.query('COMMIT');
    console.log(`Applied ${scripts.join(', ')}`);
  } finally {
    await client.end();
  }
}

void initializeDatabase().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
