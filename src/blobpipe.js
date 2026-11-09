// src/blobpipe.js - zero-leak chunked writer for BlobBlocklist.
// Caller passes entries already suffix-collapsed. Keys: <prefix>:c:<v>:<i>
const CHUNK_TARGET = 400000; // max bytes per chunk value

/** @typedef {{url: string, entries: number, loadedAt: number, error: string|null, etag: string|null, exItems: string[], exceptions?: number}} BlobSource */

/** @param {string} prefix @param {number} v @param {number} i */
function chunkKey(prefix, v, i) {
  return prefix + ':c:' + v + ':' + i;
}

/** @param {string[]} entries @param {number} target */
function packChunks(entries, target) {
  const uniq = [...new Set(entries)].sort();
  const chunks = [];
  let cur = [], size = 0;
  for (let i = 0; i < uniq.length; i++) {
    const l = uniq[i];
    const b = l.length + 1;
    if (cur.length && size + b > target) {
      chunks.push(cur.join('\n'));
      cur = [];
      size = 0;
    }
    cur.push(l);
    size += b;
  }
  if (cur.length) chunks.push(cur.join('\n'));
  return { chunks, total: uniq.length };
}

/** @param {KVLike} kv @param {string} prefix @param {{entries: string[], exceptions?: string[], sources?: Array<string|BlobSource>}} opts */
async function pipeRebuild(kv, prefix, opts) {
  const rows = (opts.sources || []).map((s) => typeof s === 'string'
    ? { url: s, entries: 0, loadedAt: Date.now(), error: null, etag: null, exItems: [], exceptions: 0 }
    : { url: s.url, entries: s.entries || 0, loadedAt: s.loadedAt || Date.now(), error: s.error || null, etag: s.etag || null, exItems: s.exItems || [], exceptions: Array.isArray(s.exItems) ? s.exItems.length : 0 });
  const exceptions = opts.exceptions || [];
  if (exceptions.length) {
    if (rows.length) rows[0].exItems = rows[0].exItems.concat(exceptions);
    else rows.push({ url: 'inline', entries: 0, loadedAt: Date.now(), error: null, etag: null, exItems: exceptions, exceptions: exceptions.length });
  }
  const meta = await kv.get(prefix + ':meta', 'json');
  const v = (meta && typeof meta.v === 'number' ? meta.v : 0) + 1;
  const packed = packChunks(opts.entries, CHUNK_TARGET);
  for (let i = 0; i < packed.chunks.length; i++) {
    await kv.put(chunkKey(prefix, v, i), packed.chunks[i]);
  }
  const nm = { v, chunkCount: packed.chunks.length, total: packed.total, sources: rows, loadedAt: Date.now() };
  await kv.put(prefix + ':meta', JSON.stringify(nm));
  let cleaned = 0;
  let cleanupIncomplete = true;
  try {
    const listing = await kv.list({ prefix: prefix + ':c:' });
    cleanupIncomplete = !listing.list_complete;
    for (const k of listing.keys) {
      const parts = k.name.split(':');
      if (parts[parts.length - 2] !== String(v)) {
        await kv.delete(k.name);
        cleaned++;
      }
    }
  } catch {
    // kv.list unavailable (test fakes / transient errors): meta swap stays
    // valid, orphaned chunks are reaped by the next successful rebuild.
  }
  return Object.assign({}, nm, { ok: true, cleaned, cleanupIncomplete });
}

export { packChunks, pipeRebuild, chunkKey, CHUNK_TARGET };
