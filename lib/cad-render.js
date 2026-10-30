/* Worker کشیدن نقشه (OffscreenCanvas): همهٔ کشیدن بیرون از رشتهٔ اصلی صفحه، تا مرورگر هنگام نقشه‌های سنگین درگیر نشود.
   پیام‌ها: init {canvas} · data {layers, colors} · view {vb, W, H, dpr, off, full} · thumb {id, pts, color} · png {id, vb, W, H, bg} */
let cv = null, cx = null, shot = null, sx = null, DB = null, CM = {}, shotVB = null, last = null, rT = 0, busy = false, again = false;
const colOf = c => CM[c] || c || '#333';
function paint(ctx, v, W, H, dpr, off, minTx){
  const k = W / v.w;
  ctx.setTransform(k * dpr, 0, 0, -k * dpr, -v.x * k * dpr, -v.y * k * dpr);
  ctx.lineWidth = 1 / k; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const X0 = v.x, X1 = v.x + v.w, Y0 = -(v.y + v.h), Y1 = -v.y, tiny = .6 / k;
  const vis = b => !b || (b[2] >= X0 && b[0] <= X1 && b[3] >= Y0 && b[1] <= Y1 && (b[2] - b[0] > tiny || b[3] - b[1] > tiny));
  const tx = [];
  for(const L of DB){ if(off && off[L.ly]) continue;
    for(const [P, c, op, b] of L.fill){ if(!vis(b)) continue; ctx.globalAlpha = op; ctx.fillStyle = colOf(c); ctx.fill(P, 'evenodd'); }
    ctx.globalAlpha = 1;
    for(const [c, K] of L.st){ ctx.strokeStyle = colOf(c); for(let i = 0; i < K.length; i++){ if(vis(K[i].b)) ctx.stroke(K[i].P); } }
    for(const t of L.tx) tx.push(t);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  for(const [x, y, h, rot, str, c, top] of tx){ const ph = h * k; if(ph < (minTx || 4)) continue; const X = (x - v.x) * k, Y = (-y - v.y) * k;
    if(X < -600 || X > W + 600 || Y < -600 || Y > H + 600) continue;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(-rot); ctx.fillStyle = colOf(c); ctx.font = ph.toFixed(1) + 'px Vazirmatn,Tahoma,sans-serif'; ctx.textBaseline = top ? 'top' : 'alphabetic';
    String(str).split('\n').forEach((ln, i) => ctx.fillText(ln, 0, i * ph * 1.35)); ctx.restore(); }
}
function size(W, H, dpr){ const w = Math.max(1, Math.round(W * dpr)), h = Math.max(1, Math.round(H * dpr));
  if(cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; shot = new OffscreenCanvas(w, h); sx = shot.getContext('2d'); shotVB = null; } }
function full(){
  rT = 0; const m = last; if(!m || !cx) return;
  size(m.W, m.H, m.dpr);
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  if(!DB) return;
  paint(cx, m.vb, m.W, m.H, m.dpr, m.off);
  sx.setTransform(1, 0, 0, 1, 0, 0); sx.clearRect(0, 0, shot.width, shot.height); sx.drawImage(cv, 0, 0); shotVB = Object.assign({}, m.vb);
}
/* حین حرکت: تصویر آخر جابه‌جا/بزرگ؛ ۱۴۰ms بعد از ایستادن کشیدن کامل */
function quick(){
  const m = last; if(!m || !cx) return; size(m.W, m.H, m.dpr);
  if(!shotVB){ full(); return; }
  const v = m.vb, s2 = shotVB.w / v.w;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
  cx.drawImage(shot, (shotVB.x - v.x) / v.w * m.W * m.dpr, (shotVB.y - v.y) / v.h * m.H * m.dpr, shot.width * s2, shot.height * s2);
  clearTimeout(rT); rT = setTimeout(full, 140);
}
self.onmessage = async e => {
  const d = e.data || {};
  if(d.init){ cv = d.canvas; cx = cv.getContext('2d'); shot = new OffscreenCanvas(1, 1); sx = shot.getContext('2d'); return; }
  if(d.data){
    CM = d.colors || {};
    DB = d.data.map(l => ({ly: l.ly, st: l.st.map(([c, L]) => [c, L.map(([p, b]) => ({P: new Path2D(p), b}))]), fill: l.fill.map(([p, c, op, b]) => [new Path2D(p), c, op, b]), tx: l.tx}));
    shotVB = null; self.postMessage({ready: 1}); return;
  }
  if(d.colors && !d.data){ CM = d.colors; shotVB = null; }
  if(d.view){ last = d.view; if(d.view.full) { clearTimeout(rT); full(); } else quick(); return; }
  if(d.thumb){
    const {pts, color, id} = d.thumb, W = 480, H = 320; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    let w = (x1 - x0) || 1, h = (y1 - y0) || 1; w *= 1.7; h *= 1.7; if(w / h > W / H) h = w * H / W; else w = h * W / H;
    const v = {x: (x0 + x1) / 2 - w / 2, y: -((y0 + y1) / 2) - h / 2, w, h};
    const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const keep = CM; CM = Object.assign({}, CM, d.light || {}); try{ if(DB) paint(g, v, W, H, 1, last && last.off, 6); } finally { CM = keep; }
    const k = W / v.w; g.setTransform(k, 0, 0, -k, -v.x * k, -v.y * k);
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
    g.globalAlpha = .22; g.fillStyle = color || '#2f6f9f'; g.fill(); g.globalAlpha = 1; g.lineWidth = 2.5 / k; g.strokeStyle = color || '#2f6f9f'; g.stroke();
    const blob = await c.convertToBlob({type: 'image/jpeg', quality: .74});
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    self.postMessage({thumb: id, url}); return;
  }
  if(d.png){
    const {id, vb, W, H, bg} = d.png; const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); g.fillStyle = bg || '#fff'; g.fillRect(0, 0, W, H);
    if(DB) paint(g, vb, W, H, 1, last && last.off);
    const bmp = c.transferToImageBitmap(); self.postMessage({png: id, bmp}, [bmp]); return;
  }
};
