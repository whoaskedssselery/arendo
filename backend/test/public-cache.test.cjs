const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCache } = require('cache-manager');
const { PublicCache } = require('../dist/cache/public-cache.service');

test('concurrent reads share a load and reuse cached empty results', async () => {
  const cache = new PublicCache(createCache());
  let loads = 0;
  async function load() {
    loads++;
    return [];
  }

  const results = await Promise.all([
    cache.read('calendar', [1, 'from', 'to'], load),
    cache.read('calendar', [1, 'from', 'to'], load),
  ]);
  assert.deepEqual(results, [[], []]);
  assert.deepEqual(await cache.read('calendar', [1, 'from', 'to'], load), []);
  assert.equal(loads, 1);
});

test('a load started before invalidation cannot restore stale calendar data', async () => {
  const cache = new PublicCache(createCache());
  const snapshotRead = Promise.withResolvers();
  const finishOldLoad = Promise.withResolvers();
  const key = [1, 'from', 'to'];
  let loads = 0;
  const previousRead = cache.read('calendar', key, async () => {
    loads++;
    snapshotRead.resolve();
    await finishOldLoad.promise;
    return [];
  });

  await snapshotRead.promise;
  cache.invalidate('calendar');
  const loadCurrent = async () => {
    loads++;
    return ['booking'];
  };
  assert.deepEqual(await cache.read('calendar', key, loadCurrent), ['booking']);
  finishOldLoad.resolve();

  assert.deepEqual(await previousRead, ['booking']);
  assert.deepEqual(await cache.read('calendar', key, loadCurrent), ['booking']);
  assert.equal(loads, 2);
});
