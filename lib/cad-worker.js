/* Worker نقشه‌خوان: خواندن DWG (LibreDWG) یا DXF و ساختن SVG، بیرون از رشتهٔ اصلی تا صفحه یخ نزند */
import {parseDxf, buildDb} from './cad-core.js';
let LD = null;
async function lib(){ if(LD) return LD; const m = await import('./libredwg/dist/libredwg-web.js'); LD = {m, lib: await m.LibreDwg.create(new URL('./libredwg/wasm', import.meta.url).href.replace(/\/?$/, ''))}; return LD; }
self.onmessage = async e => {
  const {buf, id} = e.data || {};
  try{
    const head = new TextDecoder().decode(new Uint8Array(buf).slice(0, 6));
    let db;
    if(/^AC10/.test(head)){
      self.postMessage({id, stage: 'dwg'});
      const {m, lib: L} = await lib();
      const data = L.dwg_read_data(buf, m.Dwg_File_Type.DWG);
      if(!data) throw new Error('read');
      db = L.convert(data); try{ L.dwg_free(data); }catch(er){}
    }else db = parseDxf(new TextDecoder('utf-8').decode(buf));
    self.postMessage({id, stage: 'draw'});
    const out = buildDb(db);
    self.postMessage({id, ok: true, head, n: out.n, layers: out.layers, regions: out.regions, bounds: out.bounds, snaps: out.snaps}, [out.snaps.buffer]);
  }catch(err){ self.postMessage({id, ok: false, err: String(err && err.message || err)}); }
};
