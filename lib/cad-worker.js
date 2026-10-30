/* Worker نقشه‌خوان: خواندن DWG (LibreDWG) یا DXF و ساختن SVG، بیرون از رشتهٔ اصلی تا صفحه یخ نزند */
import {parseDxf, buildDb} from './cad-core.js';
let LD = null, PRE = null;   /* PRE: خوانندهٔ کامپایل‌شده که صفحه از دفعهٔ قبل نگه داشته */
/* خوانندهٔ DWG: دریافت فایل wasm با درصد پیشرفت (کامپایل جریانی می‌ماند)؛ در Worker زنده فقط یک بار */
async function lib(prog){
  if(LD) return LD;
  const m = await import('./libredwg/dist/libredwg-web.js');
  const cm = (await import('./libredwg/wasm/libredwg-web.js')).default;
  const url = new URL('./libredwg/wasm/libredwg-web.wasm', import.meta.url).href, TOTAL = 9496803;
  const inst = await cm({
    locateFile: f => new URL('./libredwg/wasm/' + f, import.meta.url).href,
    /* این نسخهٔ Emscripten خروجیِ همین تابع را (await) به‌عنوان exports می‌گیرد: Promise برمی‌گردد */
    instantiateWasm: (imports, ok) => (async () => {
        if(PRE){ try{ const inst = await WebAssembly.instantiate(PRE, imports); return ok(inst, PRE); }catch(e){ PRE = null; } }
        const r = await fetch(url); if(!r.ok) throw new Error('fetch wasm ' + r.status);
        let got = 0, last = -1;
        const body = r.body ? r.body.pipeThrough(new TransformStream({transform(ch, c){ got += ch.byteLength; const p = Math.min(99, Math.round(got / TOTAL * 100)); if(p !== last && prog){ last = p; prog(p); } c.enqueue(ch); }})) : null;
        let res;
        try{ res = await WebAssembly.instantiateStreaming(new Response(body || await r.arrayBuffer(), {headers: {'Content-Type': 'application/wasm'}}), imports); }
        catch(e){ const r2 = await fetch(url); res = await WebAssembly.instantiate(await r2.arrayBuffer(), imports); }
        try{ self.postMessage({wasmMod: res.module}); }catch(e){}
        return ok(res.instance, res.module);
      })().catch(e => { self.postMessage({fatal: String(e && e.message || e)}); throw e; })
  });
  LD = {m, lib: m.LibreDwg.createByWasmInstance(inst)};
  return LD;
}
self.onmessage = async e => {
  if(e.data && e.data.mod){ PRE = e.data.mod; return; }
  const {buf, id} = e.data || {};
  try{
    const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 6));
    let db;
    if(/^AC10/.test(head)){
      self.postMessage({id, stage: LD || PRE ? 'dwg' : 'dl', p: 0});
      const {m, lib: L} = await lib(p => self.postMessage({id, stage: 'dl', p}));
      self.postMessage({id, stage: 'dwg'});
      const data = L.dwg_read_data(buf, m.Dwg_File_Type.DWG);
      if(!data) throw new Error('read');
      db = L.convert(data); try{ L.dwg_free(data); }catch(er){}
    }else db = parseDxf(new TextDecoder('utf-8').decode(buf));
    self.postMessage({id, stage: 'draw'});
    const out = buildDb(db);
    self.postMessage({id, ok: true, head, n: out.n, layers: out.layers, regions: out.regions, bounds: out.bounds, snaps: out.snaps}, [out.snaps.buffer]);
  }catch(err){ self.postMessage({id, ok: false, err: String(err && err.message || err)}); }
};
