import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXor16, Xor16 } from '../src/xorfilter.js';
import { parseTifText, buildTif, TifBuilder } from '../src/tifdo.js';

/** Minimal KV mock: get/put/delete/list over a Map. */
function kvMock() {
  const map = new Map();
  return {
    map,
    /** @param {string} key @param {string=} _type @returns {Promise<any>} */
    async get(key, _type) { return map.has(key) ? map.get(key) : null; },
    /** @param {string} key @param {any} val @returns {Promise<void>} */
    async put(key, val) { map.set(key, val); },
    /** @param {string} key @returns {Promise<void>} */
    async delete(key) { map.delete(key); },
    /** @param {{prefix?: string}=} opts @returns {Promise<KVListResultLike>} */
    async list(opts) {
      const p = (opts && opts.prefix) || '';
      return { keys: [...map.keys()].filter((k) => k.startsWith(p)).map((name) => ({ name })), list_complete: true, cursor: "" };
    },
  };
}

const SAMPLE = [
  '# comment',
  '// slash comment',
  '',
  '0.0.0.0 ads.evil.com',
  '127.0.0.1 tracker.evil.com',
  '*.wild.com',
  'PLAIN.Net',
  'plain.net',
  'nodot',
  'ok.mixed-case.org',
].join('\n');

test('parseTifText: comments, hosts format, wildcards, dedupe, lowercase', () => {
  const set = parseTifText(SAMPLE);
  assert.equal(set.size, 5);
  for (const d of ['ads.evil.com', 'tracker.evil.com', 'wild.com', 'plain.net', 'ok.mixed-case.org']) {
    assert.ok(set.has(d), d);
  }
  assert.ok(!set.has('nodot'));
});

test('xor16: no misses on members, rare false positives', () => {
  const keys = [];
  for (let i = 0; i < 50000; i++) keys.push('host' + i + '.example');
  const f = new Xor16(buildXor16(keys));
  for (const k of keys) assert.equal(f.has(k), true, k);
  let fp = 0;
  for (let i = 0; i < 20000; i++) if (f.has('miss' + i + '.example')) fp++;
  assert.ok(fp <= 20, 'fp ' + fp + '/20000');
});

test('xor16: tiny and empty key sets stay safe', () => {
  const f3 = new Xor16(buildXor16(['a.com', 'b.com', 'c.com']));
  assert.equal(f3.has('a.com'), true);
  assert.equal(f3.has('c.com'), true);
  const f0 = new Xor16(buildXor16([]));
  assert.equal(f0.has('a.com'), false);
});

test('buildTif: publishes chunks + filter + meta, reaps stale filters', async () => {
  const kv = kvMock();
  await kv.put('tif:filter:999', new ArrayBuffer(8));
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(SAMPLE, { headers: { etag: '"abc"' } });
  try {
    const r = await buildTif(kv, 'https://tif.example/list');
    assert.ok(r.v > 0, 'version');
    assert.ok(r.total >= 5, 'total ' + r.total);
    assert.ok(r.filterBytes > 0);
    const meta = JSON.parse(await kv.get('tif:meta'));
    assert.equal(meta.v, r.v);
    assert.equal(meta.total, r.total);
    assert.equal(meta.filterKey, 'tif:filter:' + r.v);
    assert.equal(meta.source, 'https://tif.example/list');
    assert.ok(Array.isArray(meta.spans) && meta.spans.length === meta.chunkCount, 'spans');
    const buf = await kv.get(meta.filterKey);
    assert.ok(buf && buf.byteLength === meta.filterBytes, 'filter bytes');
    assert.equal(new Xor16(buf).has('ads.evil.com'), true);
    const chunk = await kv.get('tif:c:' + r.v + ':0');
    assert.ok(chunk && chunk.includes('ads.evil.com'), 'chunk content');
    const lines = chunk.split('\n');
    assert.deepEqual(lines, [...lines].sort(), 'chunk sorted');
    assert.equal(await kv.get('tif:filter:999'), null, 'stale filter reaped');
  } finally {
    globalThis.fetch = orig;
  }
});

test('TifBuilder: /build ok, unknown path 404, missing KV 500', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(SAMPLE);
  try {
    const tif = new TifBuilder({}, { RULES: kvMock() });
    const res = await tif.fetch(new Request('https://tif/build'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.v > 0 && body.total >= 5);
    assert.equal((await tif.fetch(new Request('https://tif/nope'))).status, 404);
    const noKv = await new TifBuilder({}, {}).fetch(new Request('https://tif/build'));
    assert.equal(noKv.status, 500);
  } finally {
    globalThis.fetch = orig;
  }
});

test('TifBuilder: upstream failure surfaces as 500 with message', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });
  try {
    const res = await new TifBuilder({}, { RULES: kvMock() }).fetch(new Request('https://tif/build'));
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /HTTP 500/);
  } finally {
    globalThis.fetch = orig;
  }
});
