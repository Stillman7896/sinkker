// sizing: Set.add throughput + blob split cost -> chunk budget for a 10ms CPU plan
const doms=[];
for(let i=0;i<385000;i++) doms.push('sub'+(i%97)+'.domain'+(i%997)+'.example');
const blob=doms.join('\n');
const t=process.hrtime.bigint();
const lines=blob.split('\n');
console.log('split 8MB blob:', (Number(process.hrtime.bigint()-t)/1e6).toFixed(1)+'ms', lines.length+' lines');
const t0=process.hrtime.bigint();
const set=new Set();
for(let i=0;i<lines.length;i++) set.add(lines[i]);
const total=Number(process.hrtime.bigint()-t0)/1e6;
console.log('full Set build:', total.toFixed(1)+'ms  ('+(total/lines.length*1000).toFixed(2)+'us/entry)');
// per-chunk timing at candidate sizes
for(const n of [2500,5000,10000]){
  const t1=process.hrtime.bigint();
  const s2=new Set();
  for(let i=0;i<n;i++) s2.add(lines[i]);
  console.log('chunk '+n+' adds:', (Number(process.hrtime.bigint()-t1)/1e6).toFixed(2)+'ms');
}
// line-scan normalize cost per 10k raw lines (regex normalization pipeline)
const raw=[];
for(let i=0;i<10000;i++) raw.push(['0.0.0.0 ads'+i+'.example.com','||tracker'+i+'.net^','# comment','plain'+i+'.test'][i%4]);
const t2=process.hrtime.bigint();
const out=[];
for(const l of raw){const s=l.trim();if(!s||s[0]==='#')continue;out.push(s);}
console.log('scan 10k raw lines:', (Number(process.hrtime.bigint()-t2)/1e6).toFixed(2)+'ms');
