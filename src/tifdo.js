// src/tifdo.js - Durable Object build farm for the TIF (Threat Intelligence
// Feeds) toggle. Parsing ~1.4M entries exceeds the free plan's worker CPU
// budget, so the build runs here (30s CPU, 128MB) and only publishes to KV:
// sorted chunks (pipeRebuild, prefix 'tif') + an XOR-16 filter (~3.5MB) +
// meta with per-chunk [min,max] ranges for targeted verification. The hot
// worker never parses TIF source text.

import { pipeRebuild } from './blobpipe.js';
import { buildXor16 } from './xorfilter.js';

export const TIF_LIST_URL = 'https://raw.githubusercontent.com/cbuijs/hagezi/refs/heads/main/lists/tif/domains';
export const MAX_TIF_ENTRIES = 2000000;

/** Parse one TIF document into a deduped lowercase domain set.
 * @param {string} text @returns {Set<string>} */
export function parseTifText(text) {
  const set = new Set();
  for (const raw of text.split('\n')) {
    let line = raw.trim().toLowerCase();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const sp = line.indexOf(' ');
    if (sp > 0) line = line.slice(sp + 1).trim(); // hosts-file format
    if (line.startsWith('*.')) line = line.slice(2);
    if (line && line.includes('.') && /^[a-z0-9._-]+$/.test(line)) set.add(line);
    if (set.size > MAX_TIF_ENTRIES) throw new Error('tif: entry cap exceeded');
  }
  return set;
}

/** Full build: parse, publish chunks, build + publish filter, swap meta.
 * @param {KVLike} kv @param {string} url @returns {Promise<{v: number, total: number, filterBytes: number}>} */
export async function buildTif(kv, url) {
  const res = await fetch(url, { cf: { cacheTtl: 21600 } });
  if (!res.ok) throw new Error('tif HTTP ' + res.status + ' for ' + url);
  const set = parseTifText(await res.text());
  if (!set.size) throw new Error('tif: no entries parsed');
  const entries = [...set];
  const etag = res.headers.get('etag');
  const packed = await pipeRebuild(kv, 'tif', {
    entries,
    exceptions: [],
    sources: [{ url, entries: entries.length, loadedAt: Date.now(), error: null, etag, exItems: [] }],
  });
  const filterBuf = buildXor16(entries);
  const filterKey = 'tif:filter:' + packed.v;
  await kv.put(filterKey, filterBuf);
  const meta = {
    v: packed.v,
    total: packed.total,
    builtAt: Date.now(),
    source: url,
    etag,
    filterKey,
    filterBytes: filterBuf.byteLength,
    chunkCount: packed.chunkCount,
    spans: packed.spans || null,
  };
  await kv.put('tif:meta', JSON.stringify(meta));
  try {
    const listing = await kv.list({ prefix: 'tif:filter:' });
    for (const k of listing.keys) {
      if (k.name !== filterKey) await kv.delete(k.name);
    }
  } catch { /* best effort cleanup; reaped next build */ }
  return { v: packed.v, total: meta.total, filterBytes: meta.filterBytes };
}

/** DO with a fetch-style interface (no RPC compatibility requirements). */
export class TifBuilder {
  /** @param {any} _state @param {any} env */
  constructor(_state, env) {
    this.env = env;
    this.building = false;
  }

  /** @param {Request} request @returns {Promise<Response>} */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/build') {
      if (this.building) return Response.json({ ok: false, skipped: true, reason: 'build already in flight' });
      this.building = true;
      try {
        const target = url.searchParams.get('url') || TIF_LIST_URL;
        const kv = this.env.RULES;
        if (!kv) return Response.json({ ok: false, error: 'no KV binding' }, { status: 500 });
        const r = await buildTif(kv, target);
        return Response.json({ ok: true, ...r });
      } catch (e) {
        return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
      } finally {
        this.building = false;
      }
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
