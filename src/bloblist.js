/**
 * Sorted-blob blocklist matcher (zero-leak CPU fix).
 *
 * Entries live in KV as pre-normalized, lexicographically sorted,
 * newline-joined chunk blobs. Lookups are allocation-free binary
 * searches (no split(), no Set, no per-request rebuild). The whole
 * list is swapped atomically via a version counter in the meta
 * record, so a refresh can never leave a partial list in memory:
 * cold boot = one parallel bulk KV read, warm refresh = no-op.
 */

/**
 * Start index of the line containing pos.
 * @param {string} text Blob text.
 * @param {number} pos Any index inside the blob.
 * @returns {number} Index of the first character of that line.
 */
function lineAt(text, pos) {
  let p = pos;
  while (p > 0 && text.charCodeAt(p - 1) !== 10) p--;
  return p;
}

/**
 * End index (exclusive) of the line starting at pos.
 * @param {string} text Blob text.
 * @param {number} pos Line start index.
 * @returns {number} Index just past the line (newline or end of blob).
 */
function lineEnd(text, pos) {
  const n = text.length;
  let p = pos;
  while (p < n && text.charCodeAt(p) !== 10) p++;
  return p;
}

/**
 * Compare blob line text[s..e) with needle char-by-char (UTF-16 order,
 * identical to Array#sort's default) without allocating substrings.
 * @param {string} text Blob text.
 * @param {number} s Line start index.
 * @param {number} e Line end index (exclusive).
 * @param {string} needle Entry to compare against.
 * @returns {number} -1 line<needle, 0 equal, 1 line>needle.
 */
function cmpLine(text, s, e, needle) {
  const n = needle.length;
  for (let i = 0; i < n; i++) {
    if (s + i >= e) return -1; // line is a strict prefix of needle
    const a = text.charCodeAt(s + i);
    const b = needle.charCodeAt(i);
    if (a !== b) return a < b ? -1 : 1;
  }
  return s + n < e ? 1 : 0; // line continues past needle
}

/**
 * Allocation-free binary search for needle in a sorted blob.
 * @param {string} text Sorted newline-joined blob.
 * @param {string} needle Entry to find.
 * @returns {boolean} True when the blob contains exactly needle.
 */
function chunkHas(text, needle) {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const s = lineAt(text, mid);
    const e = lineEnd(text, s);
    const c = cmpLine(text, s, e, needle);
    if (c === 0) return true;
    if (c < 0) lo = e + 1;
    else hi = s;
  }
  return false;
}

/**
 * Yield the domain, then each ancestor label suffix:
 * a.b.c -> a.b.c, b.c, c.
 * @param {string} domain Lower-cased query domain.
 * @yields {string} Successive suffixes, longest first.
 */
function* ancestors(domain) {
  let d = domain;
  for (;;) {
    yield d;
    const i = d.indexOf('.');
    if (i === -1) return;
    d = d.slice(i + 1);
  }
}

/**
 * Drop-in replacement for the in-memory Blocklist on the hot path.
 * Fields mirror Blocklist (size, listSources, ...) so filters.js and
 * the dashboard keep working unchanged.
 */

/**
 * @typedef {{url: string, entries: number, loadedAt: number, error: string|null, etag: string|null, exItems: string[]}} BlobSource
 */
export class BlobBlocklist {
  /**
   * @param {string} prefix KV namespace: 'bl' (blocklist) or 'cloak' (cloaked).
   */
  constructor(prefix) {
    this.prefix = prefix;
    /** @type {string[]} */
    this.chunks = [];
    /** @type {Set<string>} */
    this.exceptionSet = new Set();
    /** @type {string[]} */
    this.exceptions = [];
    /** @type {Array<{url: string, from: number, to: number}>} */
    this.ranges = [];
    this.size = 0;
    this.exceptionSize = 0;
    this.loadedAt = 0;
    /** @type {string[]} */
    this.sources = [];
    this.version = -1;
    this.progress = 'empty';
  }

  /**
   * Bulk-load the complete chunk set + meta from KV and swap it in
   * atomically. On any partial read the previous version keeps
   * serving and false is returned (no leak window, ever).
   * @param {KVLike} kv KV namespace holding chunk keys "prefix:c:v:i".
   * @param {{v: number, chunkCount: number, exceptions?: string[], total?: number, sources?: string[], loadedAt?: number} | null} meta Meta record.
   * @returns {Promise<boolean>} True when a complete set is loaded.
   */
  async loadFromKV(kv, meta) {
    if (!kv || !meta) return false;
    if (typeof meta.v !== 'number' || typeof meta.chunkCount !== 'number' || meta.chunkCount < 0) return false;
    if (meta.v === this.version && this.chunks.length === meta.chunkCount) return true;
    let parts;
    try {
      const keys = [];
      for (let i = 0; i < meta.chunkCount; i++) keys.push(this.prefix + ':c:' + meta.v + ':' + i);
      parts = await Promise.all(keys.map((k) => kv.get(k)));
    } catch {
      return false;
    }
    for (const p of parts) {
      if (typeof p !== 'string') return false;
    }
    this.chunks = /** @type {string[]} */ (parts);
    this.ranges = Array.isArray(meta.ranges)
      ? /** @type {Array<{url: string, from: number, to: number}>} */ (meta.ranges)
      : [];
    const rows = Array.isArray(meta.sources) ? /** @type {BlobSource[]} */ (meta.sources) : [];
    this.sources = rows;
    /** @type {Set<string>} */
    const ex = new Set();
    for (const s of rows) {
      if (Array.isArray(s.exItems)) for (const e of s.exItems) ex.add(e);
    }
    this.exceptionSet = ex;
    this.exceptions = Array.from(ex).sort();
    this.size = typeof meta.total === 'number' ? meta.total : 0;
    this.exceptionSize = this.exceptions.length;
    this.loadedAt = typeof meta.loadedAt === 'number' ? meta.loadedAt : Date.now();
    this.version = meta.v;
    this.progress = 'ready';
    return true;
  }

  /**
   * Read the meta record once per isolate and swap in the chunk set when the
   * version moved: cold boot = one parallel KV read, warm requests = no-op.
   * @param {KVLike} kv @returns {Promise<boolean>} true when a set is loaded
   */
  async loadMeta(kv) {
    if (!kv) return false;
    let meta = null;
    try {
      const raw = await kv.get(this.prefix + ':meta');
      meta = raw ? /** @type {any} */ (JSON.parse(raw)) : null;
    } catch {
      return false;
    }
    return this.loadFromKV(kv, meta);
  }

  /**
   * Suffix-walk match: the domain itself first, then each ancestor
   * label; first entry found in any chunk wins.
   * @param {string} domain Query domain.
   * @returns {string | null} The matched entry, or null.
   */
  match(domain) {
    if (typeof domain !== 'string' || domain === '') return null;
    const d = domain.toLowerCase();
    for (const a of ancestors(d)) {
      for (const c of this.chunks) {
        if (chunkHas(c, a)) return a;
      }
    }
    return null;
  }

  /**
   * Suffix-walk exception lookup (mirror of match()).
   * @param {string} domain Query domain.
   * @returns {string | null} The matched exception entry, or null.
   */
  exception(domain) {
    if (typeof domain !== 'string' || domain === '') return null;
    const d = domain.toLowerCase();
    for (const a of ancestors(d)) {
      if (this.exceptions.includes(a)) return a;
    }
    return null;
  }

  /**
   * True when the domain matches an entry and no exception covers it.
   * @param {string} domain Query domain.
   * @returns {boolean}
   */
  isBlocked(domain) {
    return this.match(domain) !== null && this.exception(domain) === null;
  }

  /**
   * Source URLs recorded in the meta record (dashboard compatibility).
   * @returns {string[]}
   */
  /** Drop all in-memory state (KV binding changed / forced reload). */
  reset() {
    this.chunks = [];
    this.exceptionSet = new Set();
    this.exceptions = [];
    this.ranges = [];
    this.size = 0;
    this.exceptionSize = 0;
    this.loadedAt = 0;
    this.sources = [];
    this.version = -1;
    this.progress = 'empty';
  }

  listSources() {
    return this.sources;
  }
}
