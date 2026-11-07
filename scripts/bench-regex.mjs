import { RegexEngine } from '../src/filters.js';
const dom='a'.repeat(240)+'.example.com';
const base=['(^|\\.)ads?\\.','tracker','\\.doubleclick\\.net$','^(www|m)\\.','telemetry[0-9]*\\.','(^|\\.)metrics\\.','analytics','\\.track\\.','pixel','adservice'];
class S{constructor(s){this.s=s} get(){return this.s}}
const ns=([5,25,100]);
for(const n of ns){
  const set=new Set();
  for(let i=0;i<n;i++) set.add(base[i%base.length]+i);
  const eng=new RegexEngine(new S(set)); eng.test(dom); // warm compile
  const t=process.hrtime.bigint();
  for(let i=0;i<10000;i++) eng.test(dom);
  const ms=Number(process.hrtime.bigint()-t)/1e6;
  console.log('patterns='+n,'10k queries='+ms.toFixed(1)+'ms','per-query='+(ms/10).toFixed(3)+'us');
}
// pathological pattern within the 128-char validator
const evil='(a+)+$'; // 6 chars, compiles fine, catastrophic backtracking
const eng=new RegexEngine(new S(new Set([evil])));
for(const n of [22,26,30]){
  const s='a'.repeat(n)+'b';
  const t=process.hrtime.bigint();
  eng.test(s);
  console.log('evil (a+)+$ vs '+n+' a-b: '+(Number(process.hrtime.bigint()-t)/1e6).toFixed(2)+'ms');
}
