// src/xorfilter.js - XOR-16 membership filter: ~19.8 bits/entry, no false
// negatives, tiny FP (2^-16). The TIF hot path ALWAYS verifies a `has()` hit
// against the sorted chunk data, so the FP never blocks a domain. Build =
// random hypergraph peeling; retries new seeds, throws after 100 failures.

const XOR_MAGIC = 0x584f3136; // 'XO16'

/** @param {number} x @param {number} k */
function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

/** 64-bit string hash; two FNV-1a lanes + murmur-style finish.
 * @param {string} str @param {number} seed @returns {{lo: number, hi: number}} */
export function hash64(str, seed) {
  let h1 = (0x811c9dc5 ^ seed) >>> 0;
  let h2 = Math.imul(0x01000193 ^ seed, 0x9e3779b1) >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + 0x85ebca6b), 0x85ebca77) >>> 0;
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 0x45d9f3b) >>> 0;
  h2 = Math.imul(h2 ^ rotl(h2, 13), 0x45d9f3b) >>> 0;
  return { lo: h1, hi: (h1 ^ h2) >>> 0 };
}

/** The three slot indices per key; shared by build and query. */
/** @param {{lo: number, hi: number}} h @param {number} blockLen @param {number} seed @returns {[number, number, number]} */
function slots(h, blockLen, seed) {
  const i0 = h.lo % blockLen;
  const i1 = h.hi % blockLen;
  const i2 = (((Math.imul(h.lo ^ rotl(h.hi, 7), 0x27d4eb2f) ^ seed) >>> 0) % blockLen);
  return [i0, i1, i2];
}

/** @param {{lo: number, hi: number}} h @returns {number} */
function fingerprint(h) {
  return (((h.lo ^ h.hi) >>> 16) & 0xffff) || 1;
}

/** @param {Uint16Array[]} F @param {number} n @param {number} seed @param {number} blockLen @returns {ArrayBuffer} */
function serialize(F, n, seed, blockLen) {
  const out = new ArrayBuffer(20 + 6 * blockLen);
  const dv = new DataView(out);
  dv.setUint32(0, XOR_MAGIC);
  dv.setUint32(4, n);
  dv.setUint32(8, seed);
  dv.setUint32(12, blockLen);
  const bytes = new Uint8Array(out);
  for (let b = 0; b < 3; b++) bytes.set(new Uint8Array(F[b].buffer, 0, 2 * blockLen), 20 + 2 * b * blockLen);
  return out;
}

/** One peeling attempt; returns the three fingerprint arrays or null. */
/** @param {string[]} keys @param {number} n @param {number} blockLen @param {number} seed @returns {Uint16Array[]|null} */
function trySeed(keys, n, blockLen, seed) {
  const s0 = new Int32Array(n), s1 = new Int32Array(n), s2 = new Int32Array(n);
  const fpOf = new Uint16Array(n);
  const offs = [new Int32Array(blockLen + 1), new Int32Array(blockLen + 1), new Int32Array(blockLen + 1)];
  const incs = [new Int32Array(n), new Int32Array(n), new Int32Array(n)];
  const C = [new Uint16Array(blockLen), new Uint16Array(blockLen), new Uint16Array(blockLen)];
  for (let j = 0; j < n; j++) {
    const h = hash64(keys[j], seed);
    const s = slots(h, blockLen, seed);
    s0[j] = s[0]; s1[j] = s[1]; s2[j] = s[2];
    fpOf[j] = fingerprint(h);
    offs[0][s[0] + 1]++; offs[1][s[1] + 1]++; offs[2][s[2] + 1]++;
    C[0][s[0]]++; C[1][s[1]]++; C[2][s[2]]++;
  }
  for (let b = 0; b < 3; b++) {
    const o = offs[b];
    for (let i = 0; i < blockLen; i++) o[i + 1] += o[i];
    const cur = o.slice(0, blockLen);
    for (let j = 0; j < n; j++) {
      const i = b === 0 ? s0[j] : b === 1 ? s1[j] : s2[j];
      incs[b][cur[i]++] = j;
    }
  }
  const alive = new Uint8Array(n).fill(1);
  const orderK = new Int32Array(n), orderS = new Int32Array(n);
  const stack = new Int32Array(3 * blockLen + 1);
  let head = 0, tail = 0, steps = 0;
  for (let b = 0; b < 3; b++) {
    for (let i = 0; i < blockLen; i++) if (C[b][i] === 1) stack[tail++] = b * blockLen + i;
  }
  while (head < tail) {
    const s = stack[head++];
    const b = (s / blockLen) | 0, i = s % blockLen;
    if (C[b][i] !== 1) continue; // stale stack entry
    let lone = -1;
    for (let p = offs[b][i]; p < offs[b][i + 1]; p++) {
      const j = incs[b][p];
      if (alive[j]) { lone = j; break; }
    }
    if (lone < 0) continue;
    orderK[steps] = lone; orderS[steps] = s; steps++;
    alive[lone] = 0;
    const others = b === 0 ? [[1, s1[lone]], [2, s2[lone]]] : b === 1 ? [[0, s0[lone]], [2, s2[lone]]] : [[0, s0[lone]], [1, s1[lone]]];
    for (const [ob, oi] of others) {
      if (--C[ob][oi] === 1) stack[tail++] = ob * blockLen + oi;
    }
  }
  if (steps !== n) return null; // graph not peelable with this seed
  const F = [new Uint16Array(blockLen), new Uint16Array(blockLen), new Uint16Array(blockLen)];
  for (let st = steps - 1; st >= 0; st--) {
    const j = orderK[st], s = orderS[st];
    const b = (s / blockLen) | 0, i = s % blockLen;
    const p0 = b === 0 ? [1, s1[j], 2, s2[j]] : b === 1 ? [0, s0[j], 2, s2[j]] : [0, s0[j], 1, s1[j]];
    F[b][i] = (fpOf[j] ^ F[p0[0]][p0[1]] ^ F[p0[2]][p0[3]]) & 0xffff;
  }
  return F;
}

/** Build a serialized XOR-16 filter over `keys` (must be deduped). */
/** @param {string[]} keys @returns {ArrayBuffer} */
export function buildXor16(keys) {
  const n = keys.length;
  if (!n) return serialize([new Uint16Array(0), new Uint16Array(0), new Uint16Array(0)], 0, 0, 0);
  const blockLen = Math.max(32, Math.ceil((1.23 * n) / 3 / 32) * 32);
  for (let seed = 1; seed <= 100; seed++) {
    const F = trySeed(keys, n, blockLen, seed);
    if (F) return serialize(F, n, seed, blockLen);
  }
  throw new Error('xor16: construction failed for 100 seeds');
}

/** Read side: parses the serialized buffer, answers membership. */
export class Xor16 {
  /** @param {ArrayBuffer} buf */
  constructor(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0) !== XOR_MAGIC) throw new Error('xor16: bad header');
    this.n = dv.getUint32(4);
    this.seed = dv.getUint32(8);
    this.blockLen = dv.getUint32(12);
    const bl = this.blockLen, off = 20;
    this.F0 = new Uint16Array(buf, off, bl);
    this.F1 = new Uint16Array(buf, off + 2 * bl, bl);
    this.F2 = new Uint16Array(buf, off + 4 * bl, bl);
  }

  /** @param {string} name @returns {boolean} */
  has(name) {
    if (!this.n) return false;
    const h = hash64(name, this.seed);
    const s = slots(h, this.blockLen, this.seed);
    return ((this.F0[s[0]] ^ this.F1[s[1]] ^ this.F2[s[2]]) & 0xffff) === fingerprint(h);
  }
}
