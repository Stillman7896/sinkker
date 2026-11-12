// src/blbuilder.js - Durable Object build farm for blocklist subscriptions.
// Moves heavy parsing/chunking off the worker hot path to KV via pipeRebuild.

import { pipeRebuild } from './blobpipe.js';
import { parseBlocklist, collapseSuffixes, MAX_SOURCE_ENTRIES } from './blocklist.js';

export class BlocklistBuilder {
  /** @param {DurableObjectState} state @param {Env} env */
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.building = false;
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/build') {
      if (this.building) return Response.json({ ok: false, skipped: true });
      this.building = true;
      try {
        const kv = this.env.RULES;
        if (!kv) return Response.json({ ok: false, error: 'no KV binding' }, { status: 500 });

        // Fetch all configured URLs in parallel
        const urlsParam = url.searchParams.get('urls');
        if (!urlsParam) return Response.json({ ok: false, error: 'missing urls param' }, { status: 400 });
        const urls = decodeURIComponent(urlsParam).split(',').filter(Boolean);
        
        const results = await Promise.allSettled(urls.map(async (u) => {
          const res = await fetch(u, { cf: { cacheTtl: 21600 } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          const parsed = parseBlocklist(text);
          parsed.domains = collapseSuffixes(parsed.domains);
          if (parsed.domains.size > MAX_SOURCE_ENTRIES) throw new Error('entry cap exceeded');
          return { url: u, domains: [...parsed.domains], exceptions: [...parsed.exceptions] };
        }));

        const entries = [];
        const sources = [];
        let hasError = false;

        for (const r of results) {
          if (r.status === 'fulfilled') {
            entries.push(...r.value.domains);
            sources.push({
              url: r.value.url,
              entries: r.value.domains.length,
              loadedAt: Date.now(),
              error: null,
              etag: null, // TODO: capture etags for conditional requests later
              exItems: r.value.exceptions,
            });
          } else {
            hasError = true;
            // Keep previous source data if available? For now, mark error.
            // To preserve state, we'd need to read existing meta first. 
            // Simplified: fail fast or partial success. Let's do partial success.
            sources.push({
              url: 'unknown', // Placeholder, ideally map back to URL
              entries: 0,
              loadedAt: Date.now(),
              error: String(r.reason),
              etag: null,
              exItems: [],
            });
          }
        }

        if (!entries.length && !sources.length) {
           return Response.json({ ok: false, error: 'no valid sources' }, { status: 500 });
        }

        const packed = await pipeRebuild(kv, 'bl', {
          entries,
          exceptions: [], // Exceptions are inside sources.exItems
          sources,
        });

        // Construct response avoiding duplicate 'ok' key conflicts
        const payload = {
          v: packed.v,
          total: packed.total,
          chunkCount: packed.chunkCount,
          spans: packed.spans,
          sources: packed.sources,
          loadedAt: packed.loadedAt,
          cleaned: packed.cleaned,
          cleanupIncomplete: packed.cleanupIncomplete,
          hasErrors: hasError
        };
        return Response.json({ ok: true, ...payload });
      } catch (e) {
        return Response.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
      } finally {
        this.building = false;
      }
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
