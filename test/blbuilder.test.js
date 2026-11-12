import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlocklistBuilder } from '../src/blbuilder.js';

/** @typedef {{url: string, entries: number, loadedAt: number, error: string|null, etag: string|null, exItems: string[]}} SourceRow */
/** @typedef {{ok: boolean, v?: number, total?: number, chunkCount?: number, spans?: unknown, sources?: SourceRow[], loadedAt?: number, cleaned?: number, cleanupIncomplete?: boolean, error?: string}} BuildResult */

/** @param {SourceRow[]} rows @param {string} url @returns {SourceRow|undefined} */
function findSource(rows, url) {
  return rows.find((s) => s.url === url);
}

function kvMock() {
  /** @type {Map<string, any>} */
  const map = new Map();
  return {
    map,
    /** @param {string} key @param {string} [type] @returns {Promise<any>} */
    async get(key, type) {
      const v = map.has(key) ? map.get(key) : null;
      if (v === null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    /** @param {string} key @param {any} val @returns {Promise<void>} */
    async put(key, val) { map.set(key, val); },
    /** @param {string} key @returns {Promise<void>} */
    async delete(key) { map.delete(key); },
    /** @param {{prefix?: string}} [opts] @returns {Promise<{keys: Array<{name: string}>, list_complete: boolean, cursor: string}>} */
    async list(opts) {
      const p = (opts && opts.prefix) || '';
      return {
        keys: [...map.keys()].filter((k) => k.startsWith(p)).map((name) => ({ name })),
        list_complete: true,
        cursor: '',
      };
    },
  };
}

const A_URL = 'https://list.test/a';
const B_URL = 'https://list.test/b';

const LIST_A = [
  '# comment',
  'ads.example.com',
  'sub.ads.example.com',
  'tracker.one.test',
  '@@clean.example.com',
].join('\n');

const LIST_B = [
  'ads.example.com',
  'second.two.test',
].join('\n');

test('BlocklistBuilder: builds union chunks without stack-sensitive spreads', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === A_URL) return new Response(LIST_A, { headers: { etag: '"a"' } });
    if (url === B_URL) return new Response(LIST_B, { headers: { etag: '"b"' } });
    throw new Error('unexpected fetch: ' + url);
  };

  try {
    const kv = kvMock();
    const builder = new BlocklistBuilder({}, { RULES: kv });
    const res = await builder.fetch(new Request('https://bl/build?urls=' + encodeURIComponent(A_URL + ',' + B_URL)));
    assert.equal(res.status, 200);

    const data = /** @type {BuildResult} */ (await res.json());
    assert.equal(data.ok, true);
    assert.equal(data.total, 3, 'ads.example.com is deduped and sub.ads.example.com collapses into ads.example.com');

    const meta = JSON.parse(String(await kv.get('bl:meta')));
    assert.equal(meta.v, data.v);
    assert.equal(meta.total, data.total);

    const metaSources = /** @type {SourceRow[]} */ (meta.sources);
    assert.equal(metaSources.length, 2);

    const a = findSource(metaSources, A_URL);
    const b = findSource(metaSources, B_URL);
    assert.ok(a, 'source A exists');
    assert.ok(b, 'source B exists');
    assert.equal(a.etag, '"a"');
    assert.deepEqual(a.exItems, ['clean.example.com']);
    assert.equal(b.error, null);

    const chunk = await kv.get('bl:c:' + data.v + ':0');
    assert.ok(typeof chunk === 'string');
    assert.ok(chunk.includes('ads.example.com'));
    assert.ok(chunk.includes('tracker.one.test'));
    assert.ok(chunk.includes('second.two.test'));
    assert.ok(!chunk.includes('sub.ads.example.com'), 'child entry is collapsed into parent');
  } finally {
    globalThis.fetch = orig;
  }
});

test('BlocklistBuilder: one failed source is reported, successful sources still publish', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === A_URL) return new Response('nope', { status: 500 });
    if (url === B_URL) return new Response(LIST_B);
    throw new Error('unexpected fetch: ' + url);
  };

  try {
    const kv = kvMock();
    const builder = new BlocklistBuilder({}, { RULES: kv });
    const res = await builder.fetch(new Request('https://bl/build?urls=' + encodeURIComponent(A_URL + ',' + B_URL)));
    assert.equal(res.status, 200);

    const data = /** @type {BuildResult} */ (await res.json());
    assert.equal(data.ok, true);
    assert.equal(data.total, 2);

    const sources = data.sources ?? [];
    const a = findSource(sources, A_URL);
    const b = findSource(sources, B_URL);
    assert.ok(a, 'failed source A is reported');
    assert.ok(b, 'successful source B is reported');
    assert.match(String(a.error), /HTTP 500/);
    assert.equal(b.error, null);
  } finally {
    globalThis.fetch = orig;
  }
});

test('BlocklistBuilder: all sources failing returns 500 and does not publish an empty list', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 500 });

  try {
    const kv = kvMock();
    const builder = new BlocklistBuilder({}, { RULES: kv });
    const res = await builder.fetch(new Request('https://bl/build?urls=' + encodeURIComponent(A_URL)));
    assert.equal(res.status, 500);

    const data = /** @type {BuildResult} */ (await res.json());
    assert.equal(data.ok, false);
    assert.match(String(data.error), /no entries parsed/);
    assert.equal(await kv.get('bl:meta'), null, 'existing/fresh meta must not be replaced by an empty build');
  } finally {
    globalThis.fetch = orig;
  }
});

test('BlocklistBuilder: missing urls param is 400', async () => {
  const kv = kvMock();
  const builder = new BlocklistBuilder({}, { RULES: kv });
  const res = await builder.fetch(new Request('https://bl/build'));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'missing urls param');
});
