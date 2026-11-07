s=open('src/lists.js').read()
a="""/**
 * Regex validation: the pattern is stored verbatim and matched against the
 * lowercase QNAME. Bounds exist because a pattern is a hot-path cost paid on
 * every query: 4–128 chars, no whitespace, and it must compile. `new RegExp`
 * in V8 is linear-time to construct; the length cap is the ReDoS guard
 * (nested quantifiers need room to breathe).
 * @param {unknown} raw @returns {string}
 */
export function normalizeRegex(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s.length < 4 || s.length > 128) return '';
  if (/\\s/.test(s)) return '';
  try { new RegExp(s, 'i'); } catch { return ''; }
  return s;
}"""
assert a in s,'M'
n="""/**
 * Detect catastrophic-backtracking shapes: a quantifier applied to a group
 * whose own body carries a quantifier, or an unbounded quantifier over a
 * group with top-level alternation ((a+)+, (\\w+\\.)*, (a|aa)+ ...). V8 uses
 * a backtracking engine — measured on (a+)+$ vs a 30-char non-matching
 * string: 30 seconds for ONE test, i.e. one such stored pattern would hang
 * every query in the hot path. Escape- and character-class-aware; the
 * compile check still runs afterwards for everything else.
 * @param {string} p @returns {boolean} true when the pattern must be rejected
 */
export function isNestedQuantifier(p) {
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '\\\\') { i++; continue; }
    if (c === '[') { for (i++; i < p.length && p[i] !== ']'; i++) if (p[i] === '\\\\') i++; continue; }
    if (c !== '(') continue;
    let depth = 1, j = i + 1;
    for (; j < p.length && depth > 0; j++) {
      const d = p[j];
      if (d === '\\\\') { j++; continue; }
      if (d === '[') { for (j++; j < p.length && p[j] !== ']'; j++) if (p[j] === '\\\\') j++; continue; }
      if (d === '(') depth++;
      else if (d === ')') depth--;
    }
    if (depth !== 0) return false;
    const body = p.slice(i + 1, j - 1);
    const rest = p.slice(j);
    const quantAfter = /^[+*?]|^\\{\\d/.test(rest);
    const unbounded = /^[+*]|^\\{\\d+,/.test(rest);
    const quantIn = /[*+?]|\\{\\d/.test(body);
    if (quantAfter && quantIn) return true;
    if (unbounded && body.includes('|')) return true;
    if (isNestedQuantifier(body)) return true;
    i = j - 1;
  }
  return false;
}

/**
 * Regex validation: the pattern is stored verbatim and matched against the
 * lowercase QNAME. Bounds exist because a pattern is a hot-path cost paid on
 * every query: 4–128 chars, no whitespace, and it must compile. The length
 * cap bounds the per-query cost; the ReDoS guard is isNestedQuantifier()
 * (V8 backtracking is NOT linear-time — length alone proves nothing, the
 * classic (a+)+$ catastrophe is 6 characters).
 * @param {unknown} raw @returns {string}
 */
export function normalizeRegex(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (s.length < 4 || s.length > 128) return '';
  if (/\\s/.test(s)) return '';
  if (isNestedQuantifier(s)) return '';
  try { new RegExp(s, 'i'); } catch { return ''; }
  return s;
}"""
open('src/lists.js','w').write(s.replace(a,n)); print('P1 OK')
