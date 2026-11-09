import { BlobBlocklist } from '../src/bloblist.js';
import { Stager } from '../src/blobpipe.js';

class KV {
  constructor() { this.m = new Map(); }
  async get(k) { return this.m.has(k) ? this.m.get(k) : null; }
  async put(k, v) { this.m.set(k, String(v)); }
  async delete(k) { this.m.delete(k); }
  async list(o) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(o.prefix)).map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

const domains = [];
for (let i = 0; i < 12000; i++) domains.push('host' + i + '.example.net');
domains.push('ads.example.com', 'tracker.io');
const body = domains.join('\n') + '\n@@ok.test\n';

const mode = '200';
globalThis.fetch = async () => {
  if (mode === '304') return new Response(null, { status: 304, headers: { etag: '"e1"' } });
  return new Response(body, { status: 200, headers: { etag: '"e1"' } });
};

const kv = new KV();
const list = new BlobBlocklist('bl');
const stager = new Stager('bl', list);
const urls = ['https://lists.test/a'];

await stager.ensure(kv, urls, false, 86400000);
let spins = 0;
while (stager.active() && spins++ < 200) await stager.pump(kv, false);
console.log('run1 size', list.size, 'exc', list.exceptionSize, 'v>0', list.version > 0);
