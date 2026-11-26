import { createHash } from 'node:crypto';
import { Agent, get } from 'node:http';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';

const baseUrl = new URL(process.argv[2] ?? 'http://127.0.0.1:3000');
const agent = new Agent({ keepAlive: true, maxSockets: 1 });
const sampleCount = 30;
const warmupCount = 5;

function request(path, headers) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const request = get(new URL(path, baseUrl), { agent, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
        ms: performance.now() - start,
      }));
    });
    request.setTimeout(5000, () => request.destroy(new Error('HTTP request timed out.')));
    request.on('error', reject);
  });
}

async function measure(name, path, expectedStatus = 200, etag) {
  const headers = { 'Accept-Encoding': 'gzip' };
  if (etag) headers['If-None-Match'] = etag;
  const samples = [];
  let result;

  for (let i = 0; i < sampleCount + warmupCount; i++) {
    result = await request(path, headers);
    if (result.status !== expectedStatus) throw new Error(`${name}: HTTP ${result.status}.`);
    if (i >= warmupCount) samples.push(result.ms);
  }
  samples.sort((first, second) => first - second);
  const median = (samples[sampleCount / 2 - 1] + samples[sampleCount / 2]) / 2;
  const p95 = samples[Math.ceil(sampleCount * 0.95) - 1];
  const encoding = result.headers['content-encoding'] ?? 'identity';
  const decoded = encoding === 'gzip' ? gunzipSync(result.body) : result.body;
  const hash = createHash('sha256').update(decoded).digest('hex');

  console.log(`\n## ${name}`);
  console.log(`HTTP status: ${result.status}`);
  console.log(`Wire body bytes: ${result.body.length}`);
  console.log(`Decoded body bytes: ${decoded.length}`);
  console.log(`Decoded body SHA-256: ${hash}`);
  console.log(`Content-Encoding: ${encoding}`);
  console.log(`ETag: ${result.headers.etag ?? '(missing)'}`);
  console.log(`Cache-Control: ${result.headers['cache-control'] ?? '(missing)'}`);
  console.log(`Vary: ${result.headers.vary ?? '(missing)'}`);
  console.log(`HTTP median: ${median.toFixed(3)} ms`);
  console.log(`HTTP p95: ${p95.toFixed(3)} ms`);
  console.log(`Samples (ms): ${samples.map((ms) => ms.toFixed(3)).join(', ')}`);
  return result.headers.etag;
}

try {
  console.log(`Node.js ${process.version}, HTTP/1.1 keep-alive, sequential requests`);
  console.log(`Accept-Encoding: gzip. Warmups: ${warmupCount}. Measured responses per scenario: ${sampleCount}.`);

  await measure('catalog-default', '/api/v1/rooms');
  const etag = await measure('catalog-100', '/api/v1/rooms?pageSize=100');
  await measure('categories', '/api/v1/categories');
  await measure('room-detail', '/api/v1/rooms/1');
  if (!etag) throw new Error('Catalog did not return an ETag.');
  await measure('catalog-not-modified', '/api/v1/rooms?pageSize=100', 304, etag);
} finally {
  agent.destroy();
}
