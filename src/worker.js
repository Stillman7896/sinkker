// worker.js — DoH filter
// Query path: qclass guard -> response route -> answer cache -> custom
//           allowlist -> denylist -> blocklist -> blocked TLD -> blocked
//           keyword -> regex -> rebinding -> IDN -> upstream -> answer-level
//           rebinding
// Response path: answers cached under a normalized key (config epoch + name +
//           type + DO bit), transaction ID patched per client on hits.
//
// Runtime selection: the upstream provider and the per-domain response routes
// come from dashboard settings in KV. `env.UPSTREAM_URL` is the fallback for a
// deployment with no provider picked; `env.BLOCKLIST_URL` is still a var.

import { Blocklist, effectiveBlocklistUrls, MAX_SOURCE_BYTES, BLOCKLIST_ENTRY_LIMIT, MAX_BLOCKLIST_URLS } from './blocklist.js';
import { BlobBlocklist } from './bloblist.js';
import { pipeRebuild } from './blobpipe.js';
import { Xor16 } from './xorfilter.js';
import { callTifBuilder } from './tifdo.js';
export { TifBuilder } from './tifdo.js'; // Durable Object class (see tifdo.js)

/** @typedef {import('./bloblist.js').BlobSource} BlobSource */
import { RuleStore, RULES_KEY, LEGACY_RULE_PREFIX } from './rules.js';
import { SettingsStore, SETTINGS_KEY } from './settings.js';
import { RouteStore, routeRecords, ROUTES_KEY } from './routing.js';
import { TextSetStore, normalizeKeyword, normalizeRegex, DATA_VERSION_KEY } from './lists.js';
import { runQueryFilters, privateAnswerIP, BLOCKED_QUERY_STATUSES, RegexEngine } from './filters.js';
import { resolveUpstream, resolveFallback } from './upstream.js';
import { odohForward } from './odoh.js';
import { handleApi, isConfigured, safeEqual } from './dashboard.js';
import {
  Buf,
  parseQuestion,
  buildBlockedResponse,
  buildRefusedResponse,
  buildAnswerResponse,
  minTtl,
  cnameChain,
  base64urlDecode,
  ednsDo,
  buildQueryMessage,
} from './dns.js';

const DNS_MEDIA_TYPE = 'application/dns-message';
const BLOCKLIST_STALE_MS = 24 * 60 * 60 * 1000; // 24h fresh window
const BLOCKLIST_FETCH_TTL = Math.floor(BLOCKLIST_STALE_MS / 1000);
const FETCHED_AT_HEADER = 'x-blocklist-fetched-at';
const BLOCKED_MAX_AGE = 300; // filter-list / policy blocks: rarely unblocked
const RULE_MAX_AGE = 30;     // custom allow/deny: user edits stay snappy
const NEGATIVE_MAX_AGE = 60; // NXDOMAIN/NODATA from upstream: short, re-checks soon
const RESP_CACHE_MAX = 2048; // isolate answer-cache cap (entries)
const CACHE_ORIGIN = 'https://answer.cache/';
const PRUNE_EVERY = 500; // opportunistic D1 retention batch size

// ---- Per-isolate singletons (one shared KV namespace) ----
const blocklist = new BlobBlocklist('bl');


const ruleStore = new RuleStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)));
const settingsStore = new SettingsStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)));
const routeStore = new RouteStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)));
const keywordStore = new TextSetStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)), 'keywords:data', normalizeKeyword);
const regexStore = new TextSetStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)), 'regex:data', normalizeRegex);
const regexEngine = new RegexEngine(regexStore);
const tldStore = new TextSetStore(/** @type {KVLike} */ (/** @type {unknown} */ (null)), 'tlds:data');
const stores = { ruleStore, blocklist, keywordStore, regex: regexEngine, tldStore, routeStore };

/** @type {KVLike|null} */
let boundKv = null;

/** @param {Env} env */
function ensureKv(env) {
  const kv = env.RULES ?? null;
  if (kv === boundKv) return;
  boundKv = kv;
  // Binding changed (or removed) -> different namespace: drop ALL in-memory
  // state so a warm TTL cache can never serve the previous binding's
  // rules/settings.
  ruleStore.bind(/** @type {KVLike} */ (kv));
  settingsStore.bind(/** @type {KVLike} */ (kv));
  routeStore.bind(/** @type {KVLike} */ (kv));
  keywordStore.bind(/** @type {KVLike} */ (kv));
  regexStore.bind(/** @type {KVLike} */ (kv));
  cloakedList.reset();
  tldStore.bind(/** @type {KVLike} */ (kv));
}

/**
 * Keep `work` off the response path when an ExecutionContext exists
 * (`waitUntil`), or inline when there is none (tests, healthz callers).
 * Always returns a settled-never-rejecting promise; safe to `await`.
 * @param {ExecutionContext|undefined} ctx
 * @param {Promise<unknown>} work
 * @returns {Promise<unknown>|undefined}
 */
function bg(ctx, work) {
  const safe = Promise.resolve(work).catch((e) => {
    console.error('[bg] failed:', e instanceof Error ? e.message : e);
  });
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(safe);
    return undefined;
  }
  return safe;
}

/** Cache lookup that never throws (no Cache API in some test harnesses). */
/** @param {Request} req @returns {Promise<Response|undefined>} */
async function matchCache(req) {
  try {
    return (await caches.default.match(req)) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The subscriptions this deployment runs: the saved list, or the BLOCKLIST_URL
 * variable as its single entry until the user saves one (see blocklist.js).
 * @param {Env} env
 * @returns {Promise<string[]>}
 */
async function blocklistUrls(env) {
  await settingsStore.refresh(); // cheap: TTL-cached, shared data:version read
  return effectiveBlocklistUrls(settingsStore.get(), env);
}

/**
 * Free-plan ceiling guard: a document over MAX_SOURCE_BYTES costs more to split
 * and parse than the entire per-request CPU budget. It is refused *before* the
 * parse, and whatever copy is already answering queries stays in service.
 * @param {string} blUrl @param {string} text @returns {boolean} true when safe to parse
 */
function withinSourceBudget(blUrl, text) {
  if (text.length <= MAX_SOURCE_BYTES) return true;
  const mb = (text.length / 1048576).toFixed(1);
  refusedSources.set(
    blUrl,
    'document is ' + mb + ' MB, over the ' + (MAX_SOURCE_BYTES / 1048576) + ' MB per-list cap — parse skipped to stay inside the CPU budget'
  );
  return false;
}

/**
 * Reset credential: `Authorization: Bearer <pw>`, `X-Reset-Token: <pw>`, or a
 * `{"password": "<pw>"}` body. The dashboard password doubles as the reset
 * token, so the hatch needs no second secret to manage.
 * @param {Request} request @returns {Promise<string>}
 */
async function resetToken(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  const header = request.headers.get('x-reset-token');
  if (header) return header;
  try {
    const body = await request.json();
    if (body && typeof body.password === 'string') return body.password;
  } catch { /* not a JSON body */ }
  return '';
}

/**
 * Conditional fetch of ONE blocklist document; a changed body is staged for
 * the chunked rebuild (the hot path never parses source text).
 */
/** @param {string} blUrl @param {{etag: string|null, text?: null}} prev @param {ExecutionContext} [ctx] */
async function fetchBlocklistSource(blUrl, prev, ctx) {
  const cacheKey = new Request(blUrl);
  const headers = prev.etag ? { 'If-None-Match': prev.etag } : undefined;
  const res = await fetch(blUrl, { headers, cf: { cacheTtl: BLOCKLIST_FETCH_TTL } });
  if (res.status === 304) return;
  if (!res.ok) throw new Error('blocklist HTTP ' + res.status + ' for ' + blUrl);
  const text = await res.text();
  if (!withinSourceBudget(blUrl, text)) return;
  stagedSources.set(blUrl, text);
  /** @type {Record<string, string>} */
  const putHeaders = {
    'Content-Type': 'text/plain',
    'Cache-Control': 'max-age=' + BLOCKLIST_FETCH_TTL,
    [FETCHED_AT_HEADER]: String(Date.now()),
  };
  const etag = res.headers.get('etag') || prev.etag;
  if (etag) putHeaders['ETag'] = etag;
  bg(ctx, caches.default.put(cacheKey, new Response(text, { headers: putHeaders })));
}

/**
 * Stage the edge copy of ONE subscription, then revalidate it when older
 * than the stale window. Never parses on the hot path.
 */
/** @param {string} blUrl @param {boolean} force @param {ExecutionContext} [ctx] */
async function ensureBlocklistSource(blUrl, force, ctx) {
  const cacheKey = new Request(blUrl);
  const cached = await matchCache(cacheKey);
  const fetchedAt = cached ? Number(cached.headers.get(FETCHED_AT_HEADER)) || 0 : 0;
  if (cached) {
    const text = await cached.text();
    if (withinSourceBudget(blUrl, text)) stagedSources.set(blUrl, text);
  }
  if (!force && Date.now() - fetchedAt < BLOCKLIST_STALE_MS) return;
  const etag = cached ? cached.headers.get('etag') || null : null;
  await fetchBlocklistSource(blUrl, { etag, text: null }, ctx);
}

/** Staged source texts + fetch errors for the current rebuild cycle. */
const stagedSources = new Map();
const failedSources = new Map();
const refusedSources = new Map();
let rebuildInFlight = false;

/**
 * KV-free fallback so an env without a bound namespace still gets chunked
 * matching (in-memory, per-isolate, keyed by env identity). Production
 * always binds RULES and never uses this.
 */
/** @type {KVLike|null} */
let lastBlKv = null;
const volatileByEnv = new WeakMap();
/** @param {Env} env @returns {KVLike} */
function volatileKvFor(env) {
  let m = volatileByEnv.get(env);
  if (!m) {
    m = new Map();
    volatileByEnv.set(env, m);
  }
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    list: async (o) => {
      const keys = [...m.keys()].filter((k) => k.startsWith((o && o.prefix) || '')).map((n) => ({ name: n }));
      return { keys, list_complete: true, cursor: null };
    },
  };
}

/** Parse staged sources once, write chunks via pipeRebuild, swap in. */
/** @param {KVLike} kv */
async function rebuildBlocklist(kv) {
  if (rebuildInFlight) return;
  rebuildInFlight = true;
  try {
    /** @type {BlobSource[]} */
    const rows = [];
    const entries = new Set();
    for (const [url, text] of stagedSources) {
      const p = new Blocklist();
      try {
        p.load(text);
      } catch (e) {
        rows.push({ url, entries: 0, loadedAt: Date.now(), error: String(e instanceof Error ? e.message : e), etag: null, exItems: [] });
        continue;
      }
      const rawEx = p.exceptions;
      const items = rawEx instanceof Set ? [...rawEx] : (Array.isArray(rawEx) ? rawEx : (typeof p.exceptionRules === 'function' ? p.exceptionRules().map((r) => (typeof r === 'string' ? r : r.domain)) : []));
      for (const d of p.domains) entries.add(d);
      rows.push({ url, entries: p.domains.size, loadedAt: Date.now(), error: null, etag: null, exItems: items });
    }
    for (const [url, msg] of failedSources) {
      rows.push({ url, entries: 0, loadedAt: Date.now(), error: msg, etag: null, exItems: [] });
    }
    if (!entries.size) return;
    const meta = await pipeRebuild(kv, 'bl', { entries: [...entries], exceptions: [], sources: rows });
    await blocklist.loadFromKV(kv, meta);
  } finally {
    rebuildInFlight = false;
    stagedSources.clear();
  }
}

/** Fetch every subscription, rebuild chunks when anything changed. */
/** @param {Env} env @param {KVLike} kv @param {ExecutionContext} [ctx] */
async function refreshBlocklist(env, kv, ctx) {
  const urls = await blocklistUrls(env);
  if (!urls.length) return;
  failedSources.clear();
  refusedSources.clear();
  const settled = await Promise.allSettled(urls.map((u) => ensureBlocklistSource(u, false, ctx)));
  let firstError = null;
  for (let i = 0; i < urls.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') continue;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    failedSources.set(urls[i], msg);
    if (!firstError) firstError = r.reason;
  }
  if (!stagedSources.size) {
    if (refusedSources.size) {
      // Budget refusals degrade: keep serving existing chunks, mark the
      // source on the panel; a cold deploy gets an empty (harmless) list.
      /** @type {BlobSource[]} */
      const rows = [];
      if (blocklist.version >= 0) {
        for (const r of blocklist.sources) {
          if (!refusedSources.has(r.url)) rows.push(r);
        }
      }
      for (const [url, msg] of refusedSources) {
        rows.push({ url, entries: 0, loadedAt: Date.now(), error: msg, etag: null, exItems: [] });
      }
      if (blocklist.version >= 0) {
        const cur = await kv.get('bl:meta', 'json');
        if (cur) {
          await kv.put('bl:meta', JSON.stringify(Object.assign({}, cur, { sources: rows })));
          blocklist.sources = rows;
        }
      } else {
        const meta = await pipeRebuild(kv, 'bl', { entries: [], exceptions: [], sources: rows });
        await blocklist.loadFromKV(kv, meta);
      }
      return;
    }
    if (blocklist.version < 0 && firstError) throw firstError;
    return;
  }
  await rebuildBlocklist(kv);
  if (blocklist.version < 0 && firstError) throw firstError;
}

/**
 * Hot path: warm isolate + unchanged subscriptions = no-op beyond a settings
 * read; cold isolate = one KV meta read (chunks only when the version moved);
 * stale meta = background refresh; changed subscriptions or first deploy
 * rebuild inline.
 */
/** @param {Env} env @param {ExecutionContext} [ctx] @param {boolean} [force] */
async function ensureBlocklist(env, ctx, force = false) {
  ensureKv(env);
  const kv = boundKv || volatileKvFor(env);
  if (kv !== lastBlKv) {
    blocklist.reset();
    lastBlKv = kv;
  }
  if (!force && blocklist.version > 0 && (await subscriptionsUnchanged(env))) return;
  if (!force) {
    const ok = await blocklist.loadMeta(kv);
    if (ok) {
      if (Date.now() - blocklist.loadedAt >= BLOCKLIST_STALE_MS) {
        bg(ctx, refreshBlocklist(env, kv, ctx).catch(() => {}));
        return;
      }
      if (await subscriptionsUnchanged(env)) return;
    }
  }
  await refreshBlocklist(env, kv, ctx);
}

/** True when the configured subscriptions match the loaded source rows. */
/** @param {Env} env @returns {Promise<boolean>} */
async function subscriptionsUnchanged(env) {
  const urls = await blocklistUrls(env);
  const known = blocklist.sources.map((r) => r.url);
  return urls.length === known.length && urls.every((u) => known.indexOf(u) !== -1);
}


// ---- CNAME uncloaking (opt-in toggle; list auto-loaded per isolate) ----

/** AdGuard's auto-updated list of tracker domains hidden behind CNAMEs. */
const CNAME_TRACKERS_URL =
  'https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers_justdomains.txt';
const CLOAKED_TTL = 6 * 3600 * 1000;
const cloakedList = new BlobBlocklist('cloak');

// ---- TIF threat filter (XOR-16 + sorted-chunk verify; built by the DO) ----
/** @type {import('./xorfilter.js').Xor16|null} */
let tifFilter = null;
/** @type {any} */
let tifMeta = null;
let tifMetaAt = 0;
let tifBuildTried = false;
const tifChunkCache = new Map();

/** Lazy TIF state: meta (60s TTL) + filter blob; triggers one DO build when
 * the toggle is on but nothing is published yet. Never throws. */
/** @param {Env} env */
async function ensureTif(env) {
  const kv = boundKv;
  if (!kv) return;
  if (!tifMeta || Date.now() - tifMetaAt > 60000) {
    const m = await kv.get('tif:meta', 'json').catch(() => null);
    if (m) {
      tifMeta = m;
      tifFilter = null;
    }
    tifMetaAt = Date.now();
  }
  if (!tifMeta) {
    if (!tifBuildTried && env && env.TIF_BUILDER) {
      tifBuildTried = true;
      callTifBuilder(env).catch(() => {});
    }
    return;
  }
  if (!tifFilter) {
    const buf = await kv.get(tifMeta.filterKey, 'arrayBuffer').catch(() => null);
    if (!buf) return;
    try {
      tifFilter = new Xor16(buf);
    } catch {
      tifMeta = null; // broken blob: DO rebuild on a later request
    }
  }
}

/** Exact membership in the sorted chunks (binsearch by [min,max] ranges). */
/** @param {string} name @returns {Promise<boolean>} */
async function tifVerify(name) {
  if (!tifMeta || !tifMeta.spans || !boundKv) return false;
  const rs = tifMeta.spans;
  let lo = 0, hi = rs.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (name < rs[mid].min) hi = mid - 1;
    else if (name > rs[mid].max) lo = mid + 1;
    else { hit = mid; break; }
  }
  if (hit < 0) return false;
  let lines = tifChunkCache.get(hit);
  if (!lines) {
    const text = await boundKv.get('tif:c:' + tifMeta.v + ':' + hit).catch(() => null);
    if (!text) return false;
    lines = text.split('\n');
    if (tifChunkCache.size > 2) tifChunkCache.delete(tifChunkCache.keys().next().value);
    tifChunkCache.set(hit, lines);
  }
  let a = 0, b = lines.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    const c = name < lines[m] ? -1 : name > lines[m] ? 1 : 0;
    if (c === 0) return true;
    if (c < 0) b = m - 1; else a = m + 1;
  }
  return false;
}

/** Filter hit -> exact verify; walks suffix labels (max 4). Null = pass. */
/** @param {string} name @returns {Promise<string|null>} */
async function tifBlocked(name) {
  if (!tifFilter) return null;
  let n = name, hops = 0;
  while (n && hops < 4) {
    if (tifFilter.has(n) && (await tifVerify(n))) return n;
    const dot = n.indexOf('.');
    if (dot === -1) break;
    n = n.slice(dot + 1);
    hops++;
  }
  return null;
}

/** First cloaked-tracker entry that matches any chain target (suffix match).
 * @param {string[]} chain @returns {string|null}
 */
function cloakedHit(chain) {
  for (const n of chain) {
    const m = cloakedList.match(n);
    if (m) return m;
  }
  return null;
}

/**
 * Refresh the cloaked-tracker chunks at most once per TTL (KV-persisted
 * freshness via meta.loadedAt); never throws.
 */
async function ensureCloaked() {
  if (!cloakedList.chunks.length && boundKv) await cloakedList.loadMeta(boundKv);
  if (cloakedList.size > 0 && Date.now() - cloakedList.loadedAt < CLOAKED_TTL) return;
  if (!boundKv) return;
  try {
  const res = await fetch(CNAME_TRACKERS_URL, { cf: { cacheTtl: 21600 } });
    if (res.ok) {
      const text = await res.text();
      const entries = text.split('\n').map((t) => t.trim()).filter(Boolean);
      const meta = await pipeRebuild(boundKv, 'cloak', { entries, exceptions: [], sources: [] });
      await cloakedList.loadFromKV(boundKv, meta);
    }
  } catch { /* best effort */ }
}
/**
 * Forward a query to ONE upstream and return its answer bytes.
 * @param {Uint8Array} queryBuf
 * @param {{kind: 'doh'|'odoh', url: string, relay?: string}} upstream
 * @returns {Promise<Uint8Array>}
 */
async function askUpstream(queryBuf, upstream) {
  if (upstream.kind === 'odoh') return odohForward(upstream.url, upstream.relay || '', queryBuf);
  const res = await fetch(upstream.url, {
    method: 'POST',
    headers: { 'Content-Type': DNS_MEDIA_TYPE, Accept: DNS_MEDIA_TYPE },
    body: queryBuf,
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  return Buf.from(await res.arrayBuffer());
}

// Rcodes that mean "this server couldn't answer", not "the name is bad":
// SERVFAIL and REFUSED. NXDOMAIN and NOERROR/NODATA are real answers.
const UPSTREAM_BAD_RC = new Set([2, 5]);

/**
 * Forward to the primary upstream, falling back to a secondary DoH server
 * when the primary is unreachable, errors, or answers SERVFAIL/REFUSED.
 * `fallback` is null when failover is switched off (settings or deployment).
 * @param {Uint8Array} queryBuf
 * @param {ReturnType<typeof resolveUpstream>} upstream
 * @param {ReturnType<typeof resolveFallback>} fallback
 * @returns {Promise<Uint8Array>}
 */
async function forwardToUpstream(queryBuf, upstream, fallback) {
  /** @type {Uint8Array|null} */ let primary = null;
  try {
    primary = await askUpstream(queryBuf, upstream);
  } catch { /* unreachable: the fallback below decides */ }

  if (!fallback) {
    if (primary) return primary;
    throw new Error('upstream unreachable');
  }
  if (primary && !UPSTREAM_BAD_RC.has(primary[3] & 0x0f)) return primary;

  try {
    return await askUpstream(queryBuf, { kind: 'doh', url: fallback.url });
  } catch {
    if (primary) return primary; // the fallback is broken; the primary's answer stands
    throw new Error('upstream and fallback unreachable');
  }
}

/** Refresh every KV-backed store. All TTL-cached, so this is usually free. */
/** @returns {Promise<void>} */
async function refreshStores() {
  await Promise.all([
    settingsStore.refresh(),
    ruleStore.refresh(),
    routeStore.refresh(),
    keywordStore.refresh(),
    regexStore.refresh(),
    tldStore.refresh(),
  ]);
}

/** Every store re-read right now: the reset path must not wait out a TTL window. */
/** @returns {Promise<void>} */
async function forceRefreshStores() {
  await Promise.all([
    settingsStore.refresh(true),
    ruleStore.refresh(true),
    routeStore.refresh(true),
    keywordStore.refresh(true),
    regexStore.refresh(true),
    tldStore.refresh(true),
  ]);
}

// ---- D1 audit logging ----

let logsReady = false;
let logsMigrated = false;
let logCount = 0;

const LOGS_CREATE =
  'CREATE TABLE IF NOT EXISTS dns_logs (' +
  'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
  'domain TEXT NOT NULL, ' +
  'status TEXT NOT NULL, ' +
  'filter TEXT NOT NULL, ' +
  'ts INTEGER NOT NULL, ' +
  'qtype INTEGER, ' +
  'client TEXT)';

/** Never throws — logging must not break DNS responses. */
/**
 * @param {Env} env
 * @param {string} domain
 * @param {string} status
 * @param {string} filter
 * @param {string|number} qtype 'unknown' for nxdomain/refused paths
 * @param {number} retentionDays
 * @param {string|null} client tag from the DoH URL, null when untagged
 */
async function logQuery(env, domain, status, filter, qtype, retentionDays, client) {
  if (!env.LOGS) return;
  try {
    if (!logsReady) {
      await env.LOGS.prepare(LOGS_CREATE).run();
      logsReady = true;
    }
    if (!logsMigrated) {
      // Tables created before qtype/client existed lack the columns. Probe
      // the schema instead of blind-ALTERing: the old swallowed
      // "duplicate column" throw still emitted an error span in Workers
      // observability on every isolate boot.
      const cols = new Set(
        (await env.LOGS.prepare("SELECT name FROM pragma_table_info('dns_logs')").all())
          .results.map((r) => String(r.name)));
      for (const [name, def] of [['qtype', 'qtype INTEGER'], ['client', 'client TEXT']]) {
        if (!cols.has(name)) await env.LOGS.prepare(`ALTER TABLE dns_logs ADD COLUMN ${def}`).run();
      }
      logsMigrated = true;
    }
    await env.LOGS
      .prepare('INSERT INTO dns_logs (domain, status, filter, ts, qtype, client) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(domain, status, filter, Date.now(), qtype === null || qtype === undefined ? null : qtype, client)
      .run();

    logCount++;
    // Configured retention: opportunistically prune rows past the cutoff.
    // Throttled to every PRUNE_EVERY inserts so the extra write only fires
    // on a busy isolate, never on a cold query.
    if (retentionDays > 0 && logCount % PRUNE_EVERY === 0) {
      await env.LOGS
        .prepare('DELETE FROM dns_logs WHERE ts < ?')
        .bind(Date.now() - retentionDays * 86400000)
        .run();
    }
  } catch (e) {
    console.error('[logs] insert failed:', e instanceof Error ? e.message : e);
  }
}

// ---- Response builders ----

/** @param {Uint8Array} queryBuf @param {number} [maxAge] @returns {Response} */
function refused(queryBuf, maxAge = 30) {
  return new Response(buildRefusedResponse(queryBuf), {
    headers: { 'Content-Type': DNS_MEDIA_TYPE, 'Cache-Control': `max-age=${maxAge}` },
  });
}

/** Upstream unreachable: SERVFAIL-ish (502) carrying a REFUSED answer. */
/** @param {Uint8Array} queryBuf @returns {Response} */
function upstreamFailure(queryBuf) {
  return new Response(buildRefusedResponse(queryBuf), {
    status: 502,
    headers: { 'Content-Type': DNS_MEDIA_TYPE, 'Cache-Control': 'max-age=15' },
  });
}

// ---- Answer cache (isolate LRU in front of the edge cache) ----
// Keyed by config epoch + QNAME + QTYPE + DNSSEC-OK bit: cache hits survive
// across clients (the transaction ID is patched per query), and any rule or
// filter-toggle change rotates the epoch so a stale verdict is never served.

/** @type {Map<string, {bytes: Uint8Array, cacheControl: string, expiresAt: number}>} */
const respLru = new Map();

/** @param {string} epoch @param {string} name @param {number} qtype @param {boolean} dnssec */
function answerCacheKey(epoch, name, qtype, dnssec) {
  return 'v1|' + epoch + '|' + name + '|' + qtype + '|' + (dnssec ? 'd' : 's');
}

/** Epoch covering every setting that can change a verdict (rules share data:version). */
/** @param {FilterSettings} settings @param {ReturnType<typeof resolveUpstream>} upstream @param {ReturnType<typeof resolveFallback>} fallback @returns {string} */
function configEpoch(settings, upstream, fallback) {
  return (ruleStore.version || '0') +
    '.' + (settings.rebindProtection ? 1 : 0) +
    (settings.idnBlock ? 1 : 0) +
    (settings.tldBlock ? 1 : 0) +
    (settings.keywordBlock ? 1 : 0) +
    (settings.regexBlock ? 1 : 0) +
    (settings.cnameUncloaking ? 1 : 0) +
    // The blocked answer itself is cached, so changing its shape (NXDOMAIN vs
    // null IP ...) must rotate the epoch — otherwise a cached NXDOMAIN would
    // keep answering for up to BLOCKED_MAX_AGE after the setting changed.
    '|br:' + settings.blockedResponse +
    // Changing provider must never serve answers cached from the old one.
    '|' + upstream.kind + '|' + upstream.url + '|' + upstream.relay +
    // Failover changes which server answers, so it rotates the epoch too.
    '|' + (fallback ? fallback.url : 'off') +
    // Subscribing, replacing or dropping a list changes what a name resolves
    // to, so a verdict cached under the old set must never be served again.
    '|bl:' + (Array.isArray(settings.blocklistUrls) ? settings.blocklistUrls.join(',') : 'default');
}

/**
 * Cache TTL for an upstream answer: NXDOMAIN and NODATA (NOERROR with zero
 * answer records) are cached briefly — long enough to cut upstream load,
 * short enough to pick up a new record — anything else honours its own
 * record TTLs via minTtl().
 * @param {Uint8Array} answer @returns {number} seconds
 */
function answerTtl(answer) {
  const rcode = answer[3] & 0x0f;
  const answers = (answer[6] << 8) | answer[7];
  if (rcode === 3 || (rcode === 0 && answers === 0)) return NEGATIVE_MAX_AGE;
  return minTtl(answer);
}

/**
 * Response for a client with transaction ID `qid` — cached payloads come from
 * a different message, so the header ID is always rewritten.
 * @param {Uint8Array} bytes @param {string} cacheControl @param {number} qid @returns {Response}
 */
function clientResponse(bytes, cacheControl, qid) {
  const out = bytes.slice();
  out[0] = (qid >>> 8) & 0xff;
  out[1] = qid & 0xff;
  return new Response(out, {
    headers: { 'Content-Type': DNS_MEDIA_TYPE, 'Cache-Control': cacheControl },
  });
}

/** Note: maxAge/age are seconds; LRU touches re-insert for recency. */
/** @param {string} key @param {Uint8Array} bytes @param {string} cacheControl @param {number} maxAge @param {number} age */
function lruPut(key, bytes, cacheControl, maxAge, age) {
  respLru.delete(key);
  respLru.set(key, {
    bytes,
    cacheControl,
    expiresAt: Date.now() + Math.max(0, maxAge - age) * 1000,
  });
  while (respLru.size > RESP_CACHE_MAX) {
    respLru.delete(/** @type {string} */ (respLru.keys().next().value));
  }
}

/**
 * Answer lookup: isolate LRU first, then the edge cache (promoted into the
 * LRU). Null on miss; `qid` patched on every hit.
 * @param {string} key @param {number} qid @returns {Promise<Response|null>}
 */
async function cachedAnswer(key, qid) {
  const hit = respLru.get(key);
  if (hit) {
    if (hit.expiresAt > Date.now()) {
      respLru.delete(key);
      respLru.set(key, hit); // recency touch
      return clientResponse(hit.bytes, hit.cacheControl, qid);
    }
    respLru.delete(key);
  }

  const res = await matchCache(new Request(CACHE_ORIGIN + encodeURIComponent(key)));
  if (!res) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 12) return null;
  const cacheControl = res.headers.get('cache-control') || 'max-age=60';
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1]) || 0;
  const age = Number(res.headers.get('age')) || 0;
  lruPut(key, bytes, cacheControl, maxAge, age);
  return clientResponse(bytes, cacheControl, qid);
}

/**
 * Deliver answer bytes, caching them under `key` for `maxAge` seconds in both
 * cache tiers (a falsy key or zero TTL skips caching entirely).
 * @param {Uint8Array} bytes @param {string} key @param {number} maxAge
 * @param {ExecutionContext} [ctx]
 * @returns {Promise<Response>}
 */
async function respond(bytes, key, maxAge, ctx) {
  const ttl = Math.max(0, Math.floor(maxAge));
  const cacheControl = `max-age=${ttl}`;
  if (key && ttl > 0) {
    lruPut(key, bytes, cacheControl, ttl, 0);
    await bg(ctx, caches.default.put(
      new Request(CACHE_ORIGIN + encodeURIComponent(key)),
      new Response(bytes, { headers: { 'Content-Type': DNS_MEDIA_TYPE, 'Cache-Control': cacheControl } }),
    ));
  }
  return new Response(bytes, {
    headers: { 'Content-Type': DNS_MEDIA_TYPE, 'Cache-Control': cacheControl },
  });
}

// ---- Main query handler ----

/** A tag is 1-63 chars of [a-z0-9_-], lowercased; the first char is a letter/digit. */
const TAG_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62})$/;

/**
 * Client tag next to the DoH URL: `?tag=` wins over a `/dns-query/<tag>`
 * suffix. Returns the tag, null when the request is untagged, or undefined
 * when whatever was sent cannot be a tag (caller replies 400).
 * @param {URL} url @returns {string|null|undefined}
 */
function clientTag(url) {
  const param = (url.searchParams.get('tag') || '').trim().toLowerCase();
  if (param) return TAG_RE.test(param) ? param : undefined;
  const m = url.pathname.match(/^\/dns-query\/([^/?]+)$/);
  if (!m) return null;
  let raw;
  try { raw = decodeURIComponent(m[1]); } catch { return undefined; }
  raw = raw.trim().toLowerCase();
  return TAG_RE.test(raw) ? raw : undefined;
}

/**
 * @param {Uint8Array} queryBuf @param {Env} env @param {ExecutionContext} [ctx]
 * @param {string|null} client
 * @returns {Promise<Response>}
 */
async function handleQuery(queryBuf, env, ctx, client = null) {
  const q = parseQuestion(queryBuf);
  if (!q) return new Response('malformed DNS message', { status: 400 });

  // Only the IN class belongs on this resolver (blocks CH/version.bind
  // probing and other non-IN queries before any store I/O). No log row: this
  // is a wire-level reject, not a domain filtering decision.
  if (q.qclass !== 1) return refused(queryBuf, 60);

  await refreshStores();
  const settings = settingsStore.get();
  const retention = settings.logRetentionDays;
  const logPassed = settings.logPassed !== false; // tolerate pre-toggle blobs
  const upstream = resolveUpstream(settings, env);
  const fallback = resolveFallback(upstream, settings, env);

  const key = answerCacheKey(configEpoch(settings, upstream, fallback), q.name, q.qtype, ednsDo(queryBuf));
  const qid = (queryBuf[0] << 8) | queryBuf[1];
  const hit = await cachedAnswer(key, qid);
  if (hit) {
    // Filters still run on a hit (pure in-memory) so the audit log is
    // identical whether an answer came from cache or upstream.
    const verdict = runQueryFilters(stores, settings, q.name);
    if (BLOCKED_QUERY_STATUSES.has(verdict.status) || logPassed) {
      await bg(ctx, logQuery(env, q.name, verdict.status, verdict.filter, q.qtype, retention, client));
    }
    return hit;
  }

  const verdict = runQueryFilters(stores, settings, q.name);

  // A response route is a direct answer: no upstream, no cache miss, and it
  // outranks every block layer (that is why the user set it).
  if (verdict.route) {
    await bg(ctx, logQuery(env, q.name, 'route', 'route', q.qtype, retention, client));
    const records = routeRecords(verdict.route, q.name, q.qtype);
    return respond(buildAnswerResponse(queryBuf, records), key, verdict.route.ttl, ctx);
  }

  if (BLOCKED_QUERY_STATUSES.has(verdict.status)) {
    await bg(ctx, logQuery(env, q.name, verdict.status, verdict.filter, q.qtype, retention, client));
    const maxAge = verdict.filter === 'denylist' ? RULE_MAX_AGE : BLOCKED_MAX_AGE;
    return respond(buildBlockedResponse(queryBuf, settings.blockedResponse, q.qtype), key, maxAge, ctx);
  }

  if (verdict.status === 'none' && settings.tifProtection) {
    try {
      await ensureTif(env);
      const tif = await tifBlocked(q.name);
      if (tif) {
        await bg(ctx, logQuery(env, q.name, 'tif', 'tif', q.qtype, retention, client));
        return respond(buildBlockedResponse(queryBuf, settings.blockedResponse, q.qtype), key, BLOCKED_MAX_AGE, ctx);
      }
    } catch { /* degrade: TIF off for this query */ }
  }

  // allow | none -> forward upstream
  try {
    const answer = await forwardToUpstream(queryBuf, upstream, fallback);

    if (verdict.status === 'none' && settings.rebindProtection) {
      const priv = privateAnswerIP(answer);
      if (priv) {
        await bg(ctx, logQuery(env, q.name, 'rebind', 'rebind', q.qtype, retention, client));
        // Every answer can differ here; never cache the verdict (TTL only
        // tells the client not to re-ask before re-resolving).
        return respond(buildBlockedResponse(queryBuf, settings.blockedResponse, q.qtype), '', RULE_MAX_AGE, ctx);
      }
    }
    if (verdict.status === 'none' && settings.tifProtection) {
      for (const t of cnameChain(answer).slice(0, 6)) {
        const tif = await tifBlocked(t);
        if (tif) {
          await bg(ctx, logQuery(env, q.name, 'tif', 'tif', q.qtype, retention, client));
          return respond(buildBlockedResponse(queryBuf, settings.blockedResponse, q.qtype), '', BLOCKED_MAX_AGE, ctx);
        }
      }
    }
    if (verdict.status === 'none' && settings.cnameUncloaking) {
      await ensureCloaked();
      const cloak = cloakedHit(cnameChain(answer));
      if (cloak) {
        await bg(ctx, logQuery(env, q.name, 'cloaked', 'cloaked', q.qtype, retention, client));
        // The queried name is the site's own hostname: answer the QUERY
        // (not the tracker) with the configured blocked response, and keep
        // the verdict out of the answer cache (chains change).
        return respond(buildBlockedResponse(queryBuf, settings.blockedResponse, q.qtype), '', RULE_MAX_AGE, ctx);
      }
    }
    if (logPassed) {
      await bg(ctx, logQuery(env, q.name, verdict.status, verdict.filter, q.qtype, retention, client));
    }
    return respond(answer, key, answerTtl(answer), ctx);
  } catch {
    // Upstream unavailable — never break DNS.
  }

  if (logPassed) {
    await bg(ctx, logQuery(env, q.name, verdict.status, verdict.filter, q.qtype, retention, client));
  }
  return upstreamFailure(queryBuf);
}

// ---- Test endpoint (mirrors the live pipeline) ----

/** @param {string} domain @param {Env} env @param {ExecutionContext} [ctx] @returns {Promise<unknown>} */
async function testDomain(domain, env, ctx) {
  await ensureBlocklist(env, ctx);
  await refreshStores();

  const settings = settingsStore.get();
  const verdict = runQueryFilters(stores, settings, domain);
  if (verdict.status === 'none' && !verdict.route && settings.tifProtection) {
    try {
      await ensureTif(env);
      const tif = await tifBlocked(domain);
      if (tif) {
        return { domain, status: 'blocked', filter: 'tif', matched: tif, blocklistSize: blocklist.size, route: null, note: 'TIF threat feed match: ' + tif };
      }
    } catch { /* degrade: TIF off for this probe */ }
  }
  // Probe mirrors the live resolve path for CNAME uncloaking: a name that is
  // only blocked through the cloaked-tracker list must not report a pass.
  if (verdict.status === 'none' && !verdict.route && (settings.cnameUncloaking || settings.tifProtection)) {
    try {
      const upstream = resolveUpstream(settings, env);
      const fallback = resolveFallback(upstream, settings, env);
      const answer = await forwardToUpstream(buildQueryMessage(domain, 1), upstream, fallback);
      if (settings.tifProtection) {
        await ensureTif(env);
        for (const t of cnameChain(answer).slice(0, 6)) {
          const hit = await tifBlocked(t);
          if (hit) {
            return { domain, status: 'blocked', filter: 'tif', matched: hit, blocklistSize: blocklist.size, route: null, note: 'TIF threat feed via chain: ' + hit };
          }
        }
      }
      await ensureCloaked();
      const cloak = cloakedHit(cnameChain(answer));
      if (cloak) {
        return {
          domain,
          status: 'blocked',
          filter: 'cloaked',
          matched: cloak,
          blocklistSize: blocklist.size,
          route: null,
          note: 'CNAME uncloaking: the site resolves through ' + cloak,
        };
      }
    } catch { /* upstream failed — fall back to the static verdict */ }
  }
  return {
    domain,
    status: verdict.status,
    filter: verdict.filter,
    matched: verdict.matched,
    blocklistSize: blocklist.size,
    route: verdict.route || null,
    note:
      verdict.route
        ? 'answered locally from a response route — the upstream is never asked'
        : verdict.status === 'none' && settings.rebindProtection
          ? 'answer-level rebinding check applies after upstream resolves'
          : null,
  };
}

/**
 * Warm blocklist + stores concurrently. Returns an error Response when the
 * blocklist cannot be loaded at all (cold fetch failed, no usable copy),
 * null when the worker is ready to answer.
 * @param {Env} env @param {ExecutionContext} [ctx] @returns {Promise<Response|null>}
 */
async function ensureReady(env, ctx) {
  try {
    await Promise.all([ensureBlocklist(env, ctx), refreshStores()]);
    return null;
  } catch (e) {
    console.error('[boot] blocklist unavailable:', e instanceof Error ? e.message : e);
    return new Response('blocklist unavailable', { status: 503 });
  }
}

/**
 * Await `work` and turn a rejection into a one-line problem, so a health probe
 * reports *why* it is degraded instead of throwing past the reader.
 * @param {Promise<unknown>} work @param {string} label
 * @returns {Promise<string|null>}
 */
async function settle(work, label) {
  try {
    await work;
    return null;
  } catch (e) {
    return `${label}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---- Worker entry ----

export default {
  /** @param {Request} request @param {Env} env @param {ExecutionContext} [ctx] */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    ensureKv(env);

    // ---- dashboard API ----
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url, {
        rules: ruleStore,
        routes: routeStore,
        keywords: keywordStore,
        regex: regexStore,
        tlds: tldStore,
        blocklist,
        settings: settingsStore,
        // The dashboard's blocklist panel: cheap while the lists are fresh,
        // and `force` revalidates every subscription against its origin.
        blocklistRefresh: (force) => ensureBlocklist(env, ctx, force === true),
        testFn: (domain, e) => testDomain(domain, /** @type {Env} */ (e || env), ctx),
      });
    }

    // ---- escape hatch: wipe the KV configuration without the dashboard ----
    // Defense for a deployment whose own configuration blew its CPU or memory
    // budget: /api/* is unreachable then, but this route touches no store and
    // needs only the dashboard password, so one curl restores a worker that
    // boots again. Deployment variables and the D1 query log are left alone.
    if (url.pathname === '/healthz/reset' && request.method === 'POST') {
      if (!isConfigured(env)) {
        return Response.json({ error: 'reset is not armed: set DASHBOARD_PASSWORD to use it' }, { status: 403 });
      }
      const token = await resetToken(request);
      if (!token || !safeEqual(token, /** @type {string} */ (env.DASHBOARD_PASSWORD))) {
        return Response.json({ error: 'wrong reset token' }, { status: 401 });
      }
      if (!env.RULES) return Response.json({ error: 'no KV binding to reset' }, { status: 400 });

      const cleared = [];
      for (const key of [SETTINGS_KEY, RULES_KEY, ROUTES_KEY, 'keywords:data', 'regex:data', 'tlds:data', DATA_VERSION_KEY]) {
        try {
          await env.RULES.delete(key);
          cleared.push(key);
        } catch { /* keep clearing the rest */ }
      }

      // Legacy one-key-per-rule rows are re-imported on the next read and would
      // quietly undo the reset, so they go as well.
      /** @type {string[]} */ const legacy = [];
      try {
        /** @type {string|undefined} */ let cursor;
        do {
          const page = await env.RULES.list({ prefix: LEGACY_RULE_PREFIX, cursor });
          for (const k of page.keys) legacy.push(k.name);
          cursor = page.list_complete ? undefined : (page.cursor ?? undefined);
        } while (cursor);
      } catch { /* no list support: the blob key above is the one that matters */ }
      for (const name of legacy) {
        try {
          await env.RULES.delete(name);
          cleared.push(name);
        } catch { /* best effort */ }
      }

      await forceRefreshStores();
      return Response.json({
        ok: true,
        cleared,
        note: 'settings and custom rules cleared; deployment variables untouched',
      });
    }

    // ---- health ----
    if (url.pathname === '/healthz') {
      // Health must answer even when degraded: a failed blocklist load or
      // store refresh is reported in the body instead of escaping as an
      // opaque 500 — /dns-query fails for exactly the same reason, so the
      // probe is where that reason has to be visible.
      const problems = (
        await Promise.all([
          settle(ensureBlocklist(env, ctx), 'blocklist unavailable'),
          settle(refreshStores(), 'stores unavailable'),
        ])
      ).filter((p) => p !== null);
      const settings = settingsStore.get();
      const upstream = resolveUpstream(settings, env);
      const fallback = resolveFallback(upstream, settings, env);
      const urls = effectiveBlocklistUrls(settings, env);
      return Response.json({
        ok: problems.length === 0,
        problems,
        blocklistSize: blocklist.size,
        blocklistExceptions: blocklist.exceptionSize,
        blocklistSources: blocklist.listSources(),
        blocklistLoadedAt: blocklist.loadedAt,
        customRules: ruleStore.rules.size,
        routes: routeStore.routes.size,
        keywords: keywordStore.get().size,
        regexRules: regexStore.get().size,
        blockedTlds: tldStore.get().size,
        settings,
        blocklistUrl: urls[0] || '',
        blocklistUrls: urls,
        upstream,
        upstreamUrl: upstream.url,
        fallback: fallback ? { label: fallback.label, url: fallback.url, source: fallback.source } : null,
        blocklistUrlLimit: MAX_BLOCKLIST_URLS,
        blocklistEntryLimit: BLOCKLIST_ENTRY_LIMIT,
        resetArmed: isConfigured(env),
        dashboardConfigured:
          typeof env.DASHBOARD_PASSWORD === 'string' && env.DASHBOARD_PASSWORD.length > 0,
      }, { status: problems.length === 0 ? 200 : 503 });
    }

    // ---- root redirect for browsers ----
    if (url.pathname === '/') {
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return Response.redirect(new URL('/dashboard', request.url).toString(), 302);
      }
    }

    // ---- /dns-query, optionally suffixed with the client tag ----
    const dnsPath = url.pathname.match(/^\/dns-query(?:\/([^/?]+))?$/);
    if (!dnsPath) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not Found', { status: 404 });
    }
    // `?tag=phone` or `/dns-query/phone` labels the client in the query log;
    // an unusable tag fails fast so a typo never silently logs as untagged.
    const tag = clientTag(url);
    if (tag === undefined) {
      return new Response('invalid client tag: use 1-63 chars of a-z 0-9 - _', { status: 400 });
    }

    if (request.method === 'GET') {
      const accept = request.headers.get('accept') || '';
      if (!accept.includes(DNS_MEDIA_TYPE) && !accept.includes('*/*')) {
        return new Response(`Accept must include ${DNS_MEDIA_TYPE}`, { status: 406 });
      }
      const b64 = url.searchParams.get('dns');
      if (!b64) return new Response('missing ?dns=', { status: 400 });
      const buf = base64urlDecode(b64);
      if (!buf) return new Response('bad base64url', { status: 400 });
      // Validation first: malformed requests never pay for a blocklist load.
      const ready = await ensureReady(env, ctx);
      if (ready) return ready;
      return handleQuery(buf, env, ctx, tag);
    }

    if (request.method === 'POST') {
      const ct = request.headers.get('content-type') || '';
      if (!ct.startsWith(DNS_MEDIA_TYPE)) {
        return new Response(`expected ${DNS_MEDIA_TYPE}`, { status: 415 });
      }
      const raw = await request.arrayBuffer();
      if (raw.byteLength === 0 || raw.byteLength > 4096) {
        return new Response('bad body', { status: 400 });
      }
      const ready = await ensureReady(env, ctx);
      if (ready) return ready;
      return handleQuery(Buf.from(new Uint8Array(raw)), env, ctx, tag);
    }

    return new Response('Method Not Allowed', { status: 405 });
  },
};
