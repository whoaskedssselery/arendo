import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { databaseConfig } from '../dist/database/database.config.js';
import { RoomsRepository } from '../dist/rooms/rooms.repository.js';

const sampleCount = 20;
const warmupCount = 3;
const dayMs = 24 * 60 * 60 * 1000;
const hourMs = 60 * 60 * 1000;

async function captureQuery(run) {
  let query;
  const repository = new RoomsRepository({
    pool: {
      async query(text, values) {
        if (query) throw new Error('Expected exactly one query per repository operation.');
        query = { text, values };
        return { rows: [] };
      },
    },
  });
  await run(repository);
  if (!query) throw new Error('Repository did not issue a query.');
  return query;
}

async function measure(client, name, { text, values }) {
  const sql = `/* arendo benchmark ${name} */\n${text}`;
  const planSql = `EXPLAIN (ANALYZE, BUFFERS, TIMING OFF, SUMMARY ON) ${sql}`;
  const samples = [];
  for (let sample = 0; sample < warmupCount + sampleCount; sample++) {
    const { rows } = await client.query(planSql, values);
    const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
    const match = /^Execution Time: ([\d.]+) ms$/m.exec(plan);
    if (!match) throw new Error(`Execution time missing for ${name}.`);
    if (sample >= warmupCount) samples.push({ ms: Number(match[1]), plan });
  }
  samples.sort((left, right) => left.ms - right.ms);
  const lower = samples[sampleCount / 2 - 1];
  const upper = samples[sampleCount / 2];
  const p95 = samples[Math.ceil(sampleCount * 0.95) - 1].ms;

  const result = await client.query(sql, values);
  const hash = createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
  console.log(`\n## ${name}`);
  console.log(`Execution median: ${((lower.ms + upper.ms) / 2).toFixed(3)} ms\nExecution p95: ${p95.toFixed(3)} ms`);
  console.log(`Result SHA-256: ${hash}`);
  console.log(`Sample execution times (ms): ${samples.map(({ ms }) => ms.toFixed(3)).join(', ')}`);
  console.log(upper.plan);
}

const client = new Client(databaseConfig());
try {
  await client.connect();
  const {
    rows: [settings],
  } = await client.query(`SELECT current_database() AS database, version() AS version,
        current_setting('log_min_duration_statement') AS slow_query_threshold`);
  if (settings.database !== 'arendo_benchmark') throw new Error('Use the arendo_benchmark database.');

  const {
    rows: [fixture],
  } = await client.query(`SELECT
        (SELECT count(*)::int FROM rooms) AS rooms, (SELECT count(*)::int FROM bookings) AS bookings,
        (SELECT count(*)::int FROM room_photos) AS photos, (SELECT count(*)::int FROM reviews) AS reviews,
        id AS calendar_room,
        date_trunc('day', created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS anchor
        FROM rooms WHERE title = 'Benchmark room 00100'`);
  if (!fixture || fixture.rooms < 12000 || fixture.bookings < 120000) {
    throw new Error('Load db/benchmarks/seed.sql before measuring.');
  }

  console.log(settings.version);
  console.log(`Slow query threshold: ${settings.slow_query_threshold}`);
  console.log(`Rows: ${fixture.rooms} rooms, ${fixture.bookings} bookings, ${fixture.photos} photos, ${fixture.reviews} reviews`);
  console.log(`Warmups: ${warmupCount}. Measured executions per query: ${sampleCount}.`);

  const from = fixture.anchor.valueOf();
  const available = [new Date(from + 4 * dayMs + hourMs), new Date(from + 4 * dayMs + 5 * hourMs)];
  const month = [new Date(from), new Date(from + 30 * dayMs)];
  const scenarios = [
    ['catalog-default', (repository) => repository.list({}, undefined, 1, 20)],
    ['catalog-availability', (repository) => repository.list(
      { categoryId: 2, priceMin: 800, priceMax: 1700, capacity: 16 }, available, 1, 20,
    )],
    ['catalog-rating', (repository) => repository.list({ sort: 'rating_desc' }, undefined, 1, 20)],
    ['calendar-month', (repository) => repository.calendar(Number(fixture.calendar_room), month)],
  ];
  for (const [name, run] of scenarios) await measure(client, name, await captureQuery(run));
} finally {
  await client.end();
}
