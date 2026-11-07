import { Blocklist } from '../src/blocklist.js';
const H='https://raw.githubusercontent.com/cbuijs/hagezi/refs/heads/main/lists/pro-plus/domains';
const A='https://raw.githubusercontent.com/AdguardTeam/cname-trackers/master/data/combined_disguised_trackers_justdomains.txt';
const hb=()=>(process.memoryUsage().heapUsed/1048576).toFixed(1)+'M';

const docs={};
for(const [k,u] of [['hagezi',H],['adguard',A]]){
  const t0=Date.now(); docs[k]=await(await fetch(u)).text();
  console.log(k,(docs[k].length/1048576).toFixed(1)+'M fetched='+(Date.now()-t0)+'ms');
}

// baseline: current worker behaviour (blocklist 2-source + cloaked list)
if (process.env.BASELINE) {
  const bl=new Blocklist(); bl.putSource(H,docs.hagezi); bl.putSource(A,docs.adguard);
  const cloak=new Blocklist(); cloak.load(docs.adguard);
  global.gc(); global.gc();
  console.log('BASELINE entries='+bl.size+' cloak='+cloak.size+' heap='+hb());
}

// candidate: streaming parse + suffix collapse, docs released early
function streamParse(text){
  const set=new Set(),exceptions=new Set();let i=0;const n=text.length;
  while(i<n){let j=text.indexOf('\n',i);if(j===-1)j=n;
    let line=text.slice(i,j).trim();i=j+1;
    if(!line||line[0]==='#'||line[0]==='!'||line[0]==='[')continue;
    let exc=false;
    if(line.startsWith('@@')){exc=true;line=line.slice(2).trim();if(!line||line[0]==='#')continue;}
    if(line[0]==='|'){line=line[1]==='|'?line.slice(2):line.slice(1);const c=line.indexOf('^');if(c!==-1)line=line.slice(0,c);}
    else{const sp=line.search(/[\s\t]/);
      if(sp!==-1){const h=line.slice(0,sp);
        if(/^(\d{1,3}\.){3}\d{1,3}$/.test(h)||h==='::1'){for(let d of line.slice(sp+1).split(/\s+/)){d=d.toLowerCase();if(exc?exceptions.add(d):set.add(d));}continue;}
        continue;}
      const c=line.indexOf('^');if(c!==-1)line=line.slice(0,c);}
    for(let d of [line]){if(d.startsWith('*.'))d=d.slice(2);d=d.toLowerCase();
      if(d&&d.length<=253&&!d.includes(' '))(exc?exceptions:set).add(d);}
  }
  return {domains:set,exceptions};
}
function collapse(set){
  const out=new Set();
  outer:for(const d of set){
    let p=d;
    while((p=p.slice(p.indexOf('.')+1)).includes('.')) if(set.has(p)){out.add(p);continue outer;}
    out.add(d);
  }
  return out;
}
global.gc(); global.gc();
const r1=streamParse(docs.hagezi), r2=streamParse(docs.adguard);
const t0=Date.now();
const c1=collapse(r1.domains), c2=collapse(r2.domains);
console.log('CANDIDATE collapse='+(Date.now()-t0)+'ms hagezi '+r1.domains.size+'->'+c1.size+' adguard '+r2.domains.size+'->'+c2.size+' heap='+hb());
const keep1=new Set(r1.domains), keep2=new Set(r2.domains);
docs.hagezi=null; docs.adguard=null; r1.domains.clear(); r2.domains.clear();
global.gc(); global.gc();
console.log('CANDIDATE after releasing docs+raw sets heap='+hb());

// block-decision equivalence (full set vs collapsed) on blocked sample + clean domains
function walk(set,q){let d=q;for(;;){if(set.has(d))return true;const i=d.indexOf('.');if(i===-1)return false;d=d.slice(i+1);}}
let mm=0; const sa=[...keep1,...keep2].filter((_,i)=>i%331===0);
for(const d of sa){ const q='www1.'+d;
  if(walk(keep1,q)!==walk(c1,q)||walk(keep2,q)!==walk(c2,q)){mm++;if(mm<4)console.log('DIFF',q);}}
const clean=['google.com','facebook.com','amazon.com','wikipedia.org','github.com','cloudflare.com'];
let fm=0; for(const d of clean) if((c1.has(d)||c2.has(d))) { fm++; console.log('FALSE-BLOCK',d); }
console.log('EQUIV sample='+sa.length+' decision-mismatch='+mm+' clean-false-block='+fm);
