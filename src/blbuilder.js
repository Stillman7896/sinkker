// src/blbuilder.js - Durable Object build farm for blocklist subscriptions.
//
// This runs the expensive fetch/parse/chunk work off the DNS hot path.
// Do not use array.push(...hugeArray): spreading 100k+ entries as function
// arguments overflows the JavaScript call stack. Iterate instead.

import { pipeRebuild } from './blobpipe.js';
import {
  parseBlocklist,
  collapseSuffixes,
  MAX_SOURCE_ENTRIES,
  MAX_SOURCE_BYTES,
  BLOCKLIST_ENTRY_LIMIT,
} from './blocklist.js';

/** @param {string[]} target @param {Iterable<string>} source */
function pushAll(target, source) {
  for (const value of source) target.push(value);
}

/** @param {Iterable<string>} source @returns {string[]} */
function toArray(source) {
  /** @type {string[]} */
  const out = [];
  pushAll(out, source);
  return out;
}

export class BlocklistBuilder {
  /** @param {any} _state @param {Env} env */
  constructor(_state, env) {
    this.env = env;
    this.building = false;
  }

  /** @param {Request} request @returns {Promise<Response>} */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== '/build') {
      return Response.json({ error: 'not found' }, { status: 404 });
    }

    if (this.building) {
      return Response.json({ ok: false, skipped: true, reason: 'build already in flight' });
    }

    this.building = true;
    try {
      const kv = this.env.RULES;
      if (!kv) {
        return Response.json({ ok: false, error: 'no KV binding' }, { status: 500 });
      }

      const urlsParam = url.searchParams.get('urls');
      if (!urlsParam) {
        return Response.json({ ok: false, error: 'missing urls param' }, { status: 400 });
      }

      const urls = decodeURIComponent(urlsParam)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (!urls.length) {
        return Response.json({ ok: false, error: 'no urls' }, { status: 400 });
      }

      const results = await Promise.allSettled(urls.map(async (u) => {
        const res = await fetch(u, { cf: { cacheTtl: 21600 } });
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const text = await res.text();
        if (text.length > MAX_SOURCE_BYTES) {
          throw new Error('document over the per-list byte cap');
        }

        const parsed = parseBlocklist(text);
        const domains = collapseSuffixes(parsed.domains);

        if (domains.size > MAX_SOURCE_ENTRIES) {
          throw new Error('entry cap exceeded');
        }

        return {
          url: u,
          domains,
          exceptions: parsed.exceptions,
          etag: res.headers.get('etag'),
        };
      }));

      /** @type {Set<string>} */
      const entrySet = new Set();

      /** @type {Array<{url: string, entries: number, loadedAt: number, error: string|null, etag: string|null, exItems: string[]}>} */
      const sources = [];

      for (let i = 0; i < results.length; i++) {
        const r = results[i];

        if (r.status === 'fulfilled') {
          for (const d of r.value.domains) entrySet.add(d);

          sources.push({
            url: r.value.url,
            entries: r.value.domains.size,
            loadedAt: Date.now(),
            error: null,
            etag: r.value.etag || null,
            exItems: toArray(r.value.exceptions),
          });
        } else {
          sources.push({
            url: urls[i],
            entries: 0,
            loadedAt: Date.now(),
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
            etag: null,
            exItems: [],
          });
        }
      }

      if (!entrySet.size) {
        return Response.json({ ok: false, error: 'no entries parsed', sources }, { status: 500 });
      }

      if (entrySet.size > BLOCKLIST_ENTRY_LIMIT) {
        return Response.json({
          ok: false,
          error: 'merged entries exceed the free-plan ceiling',
          sources,
        }, { status: 500 });
      }

      const packed = await pipeRebuild(kv, 'bl', {
        entries: entrySet,
        exceptions: [],
        sources,
      });

      entrySet.clear();

      return Response.json({
        ok: true,
        v: packed.v,
        total: packed.total,
        chunkCount: packed.chunkCount,
        spans: packed.spans,
        sources: packed.sources,
        loadedAt: packed.loadedAt,
        cleaned: packed.cleaned,
        cleanupIncomplete: packed.cleanupIncomplete,
      });
    } catch (e) {
      return Response.json({
        ok: false,
        error: String(e instanceof Error ? e.message : e),
      }, { status: 500 });
    } finally {
      this.building = false;
    }
  }
}
