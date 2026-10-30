/* هستهٔ نقشه‌خوان: خواندن DXF و ساختن رشتهٔ SVG هر لایه از موجودیت‌ها — بی DOM، هم در Worker و هم در صفحه */
/* خوانندهٔ DXF (متنی): لایه‌ها، بلاک‌ها و موجودیت‌های اصلی */
export function parseDxf(txt){
  const L = txt.split(/\r?\n/), P = [];
  for(let i = 0; i + 1 < L.length; i += 2) P.push([+L[i].trim(), L[i + 1].replace(/\s+$/, '')]);
  const D2R = Math.PI / 180, out = {entities: [], tables: {LAYER: {entries: []}, BLOCK_RECORD: {entries: []}}};
  let i = 0, sec = '', blk = null;
  const readEnt = () => { const type = P[i][1], o = {type, layer: '0'}; i++; const v = [];
    while(i < P.length && P[i][0] !== 0){ const [c, val] = P[i], n = parseFloat(val);
      if(c === 8) o.layer = val; else if(c === 62) o.colorIndex = n; else if(c === 2) o.name = val;
      else if(c === 1) o.text = (o.text || '') + val; else if(c === 3) o.text = (o.text || '') + val;
      else if(c === 10){ if(type === 'LWPOLYLINE' || type === 'SPLINE') v.push({x: n, y: 0, bulge: 0}); else o.x = n; }
      else if(c === 20){ if(type === 'LWPOLYLINE' || type === 'SPLINE'){ if(v.length) v[v.length - 1].y = n; } else o.y = n; }
      else if(c === 42 && type === 'LWPOLYLINE'){ if(v.length) v[v.length - 1].bulge = n; }
      else if(c === 11) o.x2 = n; else if(c === 21) o.y2 = n; else if(c === 40) o.r = n; else if(c === 41) o.s41 = n; else if(c === 42) o.s42 = n;
      else if(c === 50) o.a50 = n; else if(c === 51) o.a51 = n; else if(c === 70) o.f70 = n;
      i++; }
    const e = {type, layer: o.layer, colorIndex: o.colorIndex};
    if(type === 'LINE'){ e.startPoint = {x: o.x, y: o.y}; e.endPoint = {x: o.x2, y: o.y2}; }
    else if(type === 'CIRCLE'){ e.center = {x: o.x, y: o.y}; e.radius = o.r; }
    else if(type === 'ARC'){ e.center = {x: o.x, y: o.y}; e.radius = o.r; e.startAngle = (o.a50 || 0) * D2R; e.endAngle = (o.a51 || 0) * D2R; }
    else if(type === 'LWPOLYLINE'){ e.vertices = v; e.flag = o.f70 || 0; }
    else if(type === 'SPLINE'){ e.type = 'LWPOLYLINE'; e.vertices = v; e.flag = 0; }
    else if(type === 'POLYLINE'){ e.vertices = []; e.flag = o.f70 || 0; while(i < P.length && P[i][1] === 'VERTEX'){ const vv = readEnt(); e.vertices.push({x: vv.__x, y: vv.__y, bulge: vv.__b || 0}); } if(i < P.length && P[i][1] === 'SEQEND') readEnt(); e.type = 'LWPOLYLINE'; }
    else if(type === 'VERTEX'){ e.__x = o.x; e.__y = o.y; e.__b = o.s42; }
    else if(type === 'TEXT'){ e.startPoint = {x: o.x, y: o.y}; e.textHeight = o.r || 1; e.text = o.text || ''; e.rotation = (o.a50 || 0) * D2R; }
    else if(type === 'MTEXT'){ e.insertionPoint = {x: o.x, y: o.y}; e.textHeight = o.r || 1; e.text = o.text || ''; e.rotation = (o.a50 || 0) * D2R; }
    else if(type === 'INSERT' || type === 'DIMENSION'){ e.type = 'INSERT'; e.name = o.name; e.insertionPoint = {x: type === 'DIMENSION' ? 0 : (o.x || 0), y: type === 'DIMENSION' ? 0 : (o.y || 0)}; e.xScale = type === 'DIMENSION' ? 1 : (o.s41 || 1); e.yScale = type === 'DIMENSION' ? 1 : (o.s42 || 1); e.rotation = type === 'DIMENSION' ? 0 : (o.a50 || 0) * D2R; }
    else if(type === 'ELLIPSE'){ e.center = {x: o.x, y: o.y}; e.majorAxisEndPoint = {x: o.x2, y: o.y2}; e.axisRatio = o.r || 1; e.startAngle = o.s41 || 0; e.endAngle = o.s42 == null ? Math.PI * 2 : o.s42; }
    else if(type === 'LAYER'){ e.name = o.name; e.colorIndex = o.colorIndex; }
    else if(type === 'BLOCK'){ e.name = o.name; e.basePoint = {x: o.x || 0, y: o.y || 0}; }
    return e; };
  while(i < P.length){
    const [c, v] = P[i];
    if(c === 0 && v === 'SECTION'){ sec = (P[i + 1] || [])[1]; i += 2; continue; }
    if(c === 0 && v === 'ENDSEC'){ sec = ''; i++; continue; }
    if(c !== 0){ i++; continue; }
    if(v === 'EOF') break;
    const e = readEnt();
    if(sec === 'TABLES' && e.type === 'LAYER') out.tables.LAYER.entries.push(e);
    else if(sec === 'BLOCKS'){ if(e.type === 'BLOCK'){ blk = {name: e.name, basePoint: e.basePoint, entities: []}; out.tables.BLOCK_RECORD.entries.push(blk); } else if(e.type === 'ENDBLK') blk = null; else if(blk) blk.entities.push(e); }
    else if(sec === 'ENTITIES') out.entities.push(e);
  }
  return out;
}
/* رنگ‌های ACI اصلی؛ ۷ و بی‌رنگ = رنگ خط صفحه (روز/شب) */
const ACI = {1:'#e0453a', 2:'#d4b106', 3:'#2f9e44', 4:'#1c9fb4', 5:'#3b6fd8', 6:'#b44cc7', 8:'#8a8f98', 9:'#b8bcc4', 30:'#e67e22', 40:'#d68910', 140:'#5dade2', 150:'#2e86c1', 250:'#566573', 251:'#808b96', 252:'#a6acaf', 253:'#ccd1d1'};
export function buildDb(db){
  const layers = new Map(); ((db.tables && db.tables.LAYER && db.tables.LAYER.entries) || []).forEach(l => layers.set(l.name, l));
  const blocks = new Map(); ((db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []).forEach(b => { if(b && b.name) blocks.set(b.name, b); });
  const G = new Map(), snaps = []; let n = 0;
  const col = (e, inh) => { let c = e.colorIndex; if(c == null || c === 256) c = (layers.get(e.layer) || {}).colorIndex; if(c === 0) c = inh; c = Math.abs(c || 7); return ACI[c] || 'var(--draw)'; };
  const T = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  const sc = M => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
  const f = v => (Math.round(v * 1000) / 1000);
  const arcPts = (cx, cy, r, a0, a1, M) => { let d = a1 - a0; while(d <= 0) d += Math.PI * 2; const N = Math.max(8, Math.min(96, Math.ceil(d / (Math.PI / 36)))); const o = []; for(let k = 0; k <= N; k++){ const a = a0 + d * k / N; o.push(T(M, cx + r * Math.cos(a), cy + r * Math.sin(a))); } return o; };
  const bulgePts = (p, q, b, M) => { if(!b) return [T(M, q.x, q.y)]; const th = 4 * Math.atan(b), ch = Math.hypot(q.x - p.x, q.y - p.y); if(!ch) return [T(M, q.x, q.y)];
    const r = ch / (2 * Math.sin(th / 2)), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, h = Math.sqrt(Math.max(0, r * r - ch * ch / 4)) * Math.sign(b) * (Math.abs(th) > Math.PI ? -1 : 1);
    const cx = mx - h * (q.y - p.y) / ch, cy = my + h * (q.x - p.x) / ch; let a0 = Math.atan2(p.y - cy, p.x - cx), a1 = Math.atan2(q.y - cy, q.x - cx);
    const o = b > 0 ? arcPts(cx, cy, Math.abs(r), a0, a1, M) : arcPts(cx, cy, Math.abs(r), a1, a0, M).reverse(); return o.slice(1); };
  /* خروجی برای Canvas: هر لایه — خط‌ها به تفکیک رنگ (یک رشتهٔ مسیر SVG برای Path2D)، سطوح پُر، متن‌ها */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const bb = p => { if(p[0] < x0) x0 = p[0]; if(p[0] > x1) x1 = p[0]; if(p[1] < y0) y0 = p[1]; if(p[1] > y1) y1 = p[1]; };
  const LY = ly => { let o = G.get(ly); if(!o){ o = {st: new Map(), fill: [], tx: []}; G.set(ly, o); } return o; };
  const stroke = (ly, c, d) => { const o = LY(ly); o.st.set(c, (o.st.get(c) || '') + d); n++; };
  const pd = pts => { let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]); bb(pts[0]); for(let k = 1; k < pts.length; k++){ d += 'L' + f(pts[k][0]) + ' ' + f(pts[k][1]); bb(pts[k]); } return d; };
  const txt = s => String(s || '').replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
  function draw(list, M, inhCol, depth){
    (list || []).forEach(e => { try{
      if(!e || e.isInPaperSpace || e.isVisible === false) return;
      const ly = e.layer || '0', c = col(e, inhCol);
      switch(e.type){
        case 'LINE': { const a = T(M, e.startPoint.x, e.startPoint.y), b = T(M, e.endPoint.x, e.endPoint.y); stroke(ly, c, pd([a, b])); snaps.push(a, b); break; }
        case 'CIRCLE': { const a = T(M, e.center.x, e.center.y), r = e.radius * sc(M); bb([a[0] - r, a[1] - r]); bb([a[0] + r, a[1] + r]);
          stroke(ly, c, 'M' + f(a[0] + r) + ' ' + f(a[1]) + 'A' + f(r) + ' ' + f(r) + ' 0 1 0 ' + f(a[0] - r) + ' ' + f(a[1]) + 'A' + f(r) + ' ' + f(r) + ' 0 1 0 ' + f(a[0] + r) + ' ' + f(a[1])); snaps.push(a); break; }
        case 'ARC': { const p = arcPts(e.center.x, e.center.y, e.radius, e.startAngle, e.endAngle, M); stroke(ly, c, pd(p)); snaps.push(p[0], p[p.length - 1], T(M, e.center.x, e.center.y)); break; }
        case 'ELLIPSE': { const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y, R = Math.hypot(mx, my), rot = Math.atan2(my, mx), rr = R * (e.axisRatio || 1);
          let a0 = e.startAngle || 0, a1 = e.endAngle == null ? Math.PI * 2 : e.endAngle; if(a1 <= a0) a1 += Math.PI * 2; const N = 48, o = [];
          for(let k = 0; k <= N; k++){ const a = a0 + (a1 - a0) * k / N, x = R * Math.cos(a), y = rr * Math.sin(a); o.push(T(M, e.center.x + x * Math.cos(rot) - y * Math.sin(rot), e.center.y + x * Math.sin(rot) + y * Math.cos(rot))); }
          stroke(ly, c, pd(o)); break; }
        case 'LWPOLYLINE': case 'POLYLINE2D': case 'POLYLINE3D': { const V = e.vertices || []; if(V.length < 2) break; const closed = (e.flag & 1) === 1 || (e.flag & 512) === 512;
          const o = [T(M, V[0].x, V[0].y)]; for(let k = 1; k < V.length; k++) o.push(...bulgePts(V[k - 1], V[k], V[k - 1].bulge, M)); if(closed) o.push(...bulgePts(V[V.length - 1], V[0], V[V.length - 1].bulge, M));
          stroke(ly, c, pd(o)); V.forEach(v => snaps.push(T(M, v.x, v.y))); break; }
        case 'SPLINE': { const V = (e.fitPoints && e.fitPoints.length ? e.fitPoints : e.controlPoints) || []; if(V.length > 1) stroke(ly, c, pd(V.map(v => T(M, v.x, v.y)))); break; }
        case 'SOLID': case 'TRACE': case '3DFACE': { const k = ['corner1', 'corner2', 'corner4', 'corner3'].map(q => e[q]).filter(Boolean); if(k.length >= 3){ LY(ly).fill.push([pd(k.map(v => T(M, v.x, v.y))) + 'Z', c, .5]); n++; } break; }
        case 'TEXT': case 'ATTRIB': case 'MTEXT': { const p = e.insertionPoint || e.startPoint; if(!p || !e.text) break; const h = (e.textHeight || 1) * sc(M), a = T(M, p.x, p.y); bb(a);
          const rot = (e.rotation || 0) + Math.atan2(M[1], M[0]);
          LY(ly).tx.push([f(a[0]), f(a[1]), h, rot, String(e.text).split(/\\P/).map(txt).join('\n'), c, e.type === 'MTEXT' ? 1 : 0]); n++; break; }
        case 'INSERT': { const B = blocks.get(e.name); if(!B || depth > 8) break; const r = e.rotation || 0, sx = e.xScale || 1, sy = e.yScale || 1, bp = B.basePoint || {x: 0, y: 0};
          const ip = e.insertionPoint || {x: 0, y: 0};
          const L2 = [Math.cos(r) * sx, Math.sin(r) * sx, -Math.sin(r) * sy, Math.cos(r) * sy, ip.x, ip.y];
          const M2 = mul(M, mul(L2, [1, 0, 0, 1, -bp.x, -bp.y]));
          draw(B.entities, M2, c, depth + 1); (e.attribs || []).forEach(at => draw([at], M, c, depth + 1)); break; }
        case 'HATCH': { const paths = (e.boundaryPaths || []).map(bp => { if(bp.vertices){ const V = bp.vertices; if(V.length < 3) return ''; const o = [T(M, V[0].x, V[0].y)]; for(let k = 1; k < V.length; k++) o.push(...bulgePts(V[k - 1], V[k], V[k - 1].bulge, M)); return pd(o) + 'Z'; }
            const o = []; (bp.edges || []).forEach(ed => { if(ed.start && ed.end){ o.push(T(M, ed.start.x, ed.start.y), T(M, ed.end.x, ed.end.y)); } else if(ed.center && ed.radius){ const a0 = ed.startAngle, a1 = ed.endAngle; o.push(...(ed.isCCW === false ? arcPts(ed.center.x, ed.center.y, ed.radius, -a1, -a0, M).reverse() : arcPts(ed.center.x, ed.center.y, ed.radius, a0, a1, M))); } });
            return o.length > 2 ? pd(o) + 'Z' : ''; }).join('');
          if(paths){ LY(ly).fill.push([paths, c, e.solidFill === 1 ? .55 : .14]); n++; } break; }
        case 'POINT': break;
        default: break;
      } }catch(er){} });
  }
  draw(db.entities, [1, 0, 0, 1, 0, 0], 7, 0);
  const sn = snaps.filter(p => isFinite(p[0]) && isFinite(p[1])).slice(0, 150000), F = new Float64Array(sn.length * 2);
  sn.forEach((p, k) => { F[k * 2] = p[0]; F[k * 2 + 1] = p[1]; });
  return {n, layers: Array.from(G.entries()).map(([ly, o]) => ({ly, st: Array.from(o.st.entries()), fill: o.fill, tx: o.tx})), snaps: F,
    bounds: isFinite(x0) ? {x0, y0, x1, y1} : null};
}
