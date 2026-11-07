import { Blocklist } from '../src/blocklist.js';
const URLS = {
  hagezi: 'https://raw.githubusercontent.com/cbuijs/hagezi/refs/heads/main/lists/pro-plus/domains',
  adguard_cname: 'https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers_justdomains.txt',
};
const bl = new Blocklist();
for (const [name, url] of Object.entries(URLS)) {
  try {
    const t0 = Date.now();
    const text = await (await fetch(url)).text();
    const bytes = text.length;
    const t1 = Date.now();
    bl.putSource(url, text);
    const t2 = Date.now();
    console.log(name, 'bytes=' + (bytes/1048576).toFixed(1) + 'M fetch=' + (t1-t0) + 'ms parse=' + (t2-t1) + 'ms');
  } catch (e) { console.log(name, 'FAIL', e.message); }
}
global.gc(); global.gc();
const m = process.memoryUsage();
console.log('merged', bl.size, 'exc', bl.exceptionSize, 'rss=' + (m.rss/1048576).toFixed(1) + 'M heap=' + (m.heapUsed/1048576).toFixed(1) + 'M');

// candidate 1: suffix collapse (drop entries whose parent is already blocked)
const collapsed = new Set(); let dropped = 0;
for (const d of bl.domains) {
  let p = d, hit = false;
  while ((p = p.slice(p.indexOf('.') + 1)).includes('.')) if (bl.domains.has(p)) { hit = true; break; }
  hit ? dropped++ : collapsed.add(d);
}
global.gc(); global.gc();
const m2 = process.memoryUsage();
console.log('collapse: kept=' + collapsed.size + ' dropped=' + dropped, 'rss=' + (m2.rss/1048576).toFixed(1) + 'M heap=' + (m2.heapUsed/1048576).toFixed(1) + 'M');

// equivalence check on random sample
let mismatch = 0; const sample = [...bl.domains].filter((_, i) => i % 997 === 0);
for (const d of sample) {
  const a = bl.walk(bl.domains, d), b = bl.walk(collapsed, d);
  if (a !== b) mismatch++;
}
console.log('equivalence: sample=' + sample.length + ' mismatch=' + mismatch);
