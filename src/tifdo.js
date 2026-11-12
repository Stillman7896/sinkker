// src/tifdo.js - Durable Object build farm for the TIF (Threat Intelligence
// Feeds) toggle. Parsing ~1.4M entries exceeds the free plan's worker CPU
// budget, so the build runs here (30s CPU, 128MB) and only publishes to KV:
// sorted chunks (pipeRebuild, prefix 'tif') + an XOR-16 filter (~3.5MB) +
// meta with per-chunk [min,max] ranges for targeted verification. The hot
// worker never parses TIF source text.

import { pipeRebuild } from './blobpipe.js';
import { buildXor16, Xor16 } from './xorfilter.js';

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
    if (line.endsWith('.')) line = line.slice(0, -1);
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
  const entries = Array.from(set);
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

/** Trigger a TIF build through the canonical namespace API (idFromName -> get -> stub.fetch);
 * the one-arg namespace.fetch() shortcut is not available on all deployed stubs.
 * @param {any} env @returns {Promise<Response>} */
export async function callTifBuilder(env) {
  const ns = env && env.TIF_BUILDER;
  if (!ns || typeof ns.idFromName !== "function" || typeof ns.get !== "function") {
    throw new Error("TIF_BUILDER binding missing or invalid (update wrangler.toml, redeploy)");
  }
  return ns.get(ns.idFromName("builder")).fetch(new Request("https://tif/build"));
}

/** Diagnostic lookup: filter hit + exact chunk verification for one name.
 * @param {KVLike|null} kv @param {string} rawName @returns {Promise<{name: string, metaLoaded: boolean, filterHit: boolean|null, verified: boolean, matched: string|null}>} */
export async function tifCheck(kv, rawName) {
  const name = String(rawName || "").trim().toLowerCase().replace(/\.$/, "");
  const meta = kv ? await kv.get("tif:meta", "json").catch(() => null) : null;
  const out = /** @type {{name: string, metaLoaded: boolean, filterHit: boolean|null, verified: boolean, matched: string|null}} */ ({ name, metaLoaded: Boolean(meta), filterHit: null, verified: false, matched: null });
  if (!kv || !meta || !meta.filterKey) return out;
  const buf = await kv.get(meta.filterKey, "arrayBuffer").catch(() => null);
  if (!buf) return out;
  let filter;
  try {
    filter = new Xor16(buf);
  } catch {
    return out;
  }
  let n = name, hops = 0;
  while (n && hops < 4) {
    if (filter.has(n)) {
      out.filterHit = true;
      if (await tifChunkHas(kv, meta, n)) { out.verified = true; out.matched = n; }
      break;
    }
    const dot = n.indexOf(".");
    if (dot === -1) break;
    n = n.slice(dot + 1);
    hops++;
  }
  if (out.filterHit === null) out.filterHit = false;
  return out;
}

/** Binary search one name inside the span-selected chunk. @param {KVLike} kv @param {any} meta @param {string} name @returns {Promise<boolean>} */
async function tifChunkHas(kv, meta, name) {
  const spans = meta.spans;
  if (!Array.isArray(spans)) return false;
  let lo = 0, hi = spans.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (name < spans[mid].min) hi = mid - 1;
    else if (name > spans[mid].max) lo = mid + 1;
    else { hit = mid; break; }
  }
  if (hit < 0) return false;
  const text = await kv.get("tif:c:" + meta.v + ":" + hit).catch(() => null);
  if (!text) return false;
  const lines = text.split("\n");
  let a = 0, b = lines.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    const c = name < lines[m] ? -1 : name > lines[m] ? 1 : 0;
    if (c === 0) return true;
    if (c < 0) b = m - 1; else a = m + 1;
  }
  return false;
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
