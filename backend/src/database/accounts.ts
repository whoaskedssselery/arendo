// Учётные записи, которые нельзя создать через регистрацию.
//   ADMIN_EMAIL и ADMIN_PASSWORD — создать или обновить администратора;
//   DEMO_PASSWORD — задать пароль демонстрационным пользователям из db/03_seed.sql.
import { hash } from 'bcryptjs';
import { Client } from 'pg';
import { databaseConfig } from './database.config';

function password(name: string): string | undefined {
  const value = process.env[name];
  if (value && (value.length < 8 || Buffer.byteLength(value, 'utf8') > 72)) {
    throw new Error(`${name}: от 8 символов и не длиннее 72 байт.`);
  }
  return value || undefined;
}

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = password('ADMIN_PASSWORD');
  const demoPassword = password('DEMO_PASSWORD');
  const client = new Client(databaseConfig());
  await client.connect();
  try {
    if (demoPassword) {
      // Только записи с хэшем-заглушкой: настоящие пароли не перезаписываются.
      const { rowCount } = await client.query(
        "UPDATE users SET password_hash = $1 WHERE email LIKE '%@arendo.test' AND password_hash LIKE '%seedseed%'",
        [await hash(demoPassword, 12)],
      );
      console.log(`Demo accounts updated: ${rowCount}`);
    }
    if (email && adminPassword) {
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, 'Администратор', 'admin')
         ON CONFLICT ((lower(email))) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', status = 'active'`,
        [email, await hash(adminPassword, 12)],
      );
      console.log(`Administrator ready: ${email}`);
    }
  } finally {
    await client.end();
  }
}

void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
