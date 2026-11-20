/* ساخت نسخهٔ انتشار: index.html منبع ← index.html کوچک‌شده
   JS: terser (mangle نام‌های محلی + فشرده‌سازی امن، بدون تغییر نام‌های سراسری)
   CSS: فقط حذف توضیح و فاصله (بدون بازنویسی قانون‌ها تا رفتار و mediaText عوض نشود) */
const fs = require('fs'), path = require('path'), { minify } = require(path.join(__dirname, 'node_modules', 'terser'));
const [,, src, out] = process.argv;
let html = fs.readFileSync(src, 'utf8');
function cssMin(c){
  let o = '', i = 0, q = null;
  while(i < c.length){ const ch = c[i];
    if(q){ o += ch; if(ch === '\\'){ o += c[i + 1] || ''; i += 2; continue; } if(ch === q) q = null; i++; continue; }
    if(ch === '"' || ch === "'"){ q = ch; o += ch; i++; continue; }
    if(ch === '/' && c[i + 1] === '*'){ const e = c.indexOf('*/', i + 2); i = e < 0 ? c.length : e + 2; continue; }
    o += ch; i++; }
  /* فاصله‌ها: خط‌ها و تورفتگی؛ فاصلهٔ داخل مقدارها (مثل "0 0 1px") دست نمی‌خورد */
  return o.replace(/\s*\n\s*/g, '\n').replace(/\n+/g, '\n').replace(/\n?([{};])\n?/g, '$1').replace(/^\s+|\s+$/g, '');
}
/* ۶۰۶: حذف قاعده‌های CSS مرده — قاعده‌ای که همهٔ سلکتورهایش کلاس یا شناسه‌ای می‌خواهند که هیچ‌جای کد غیر CSS (اسکریپت‌ها، HTML،
   ترجمه، کتابخانه‌های درج‌شده) نیامده، هرگز به عنصری نمی‌خورد. محافظه‌کارانه: هر رشته‌ای که پشتش + یا ${ آمده پیشوندِ ساخت پویا حساب می‌شود
   و همهٔ کلاس‌هایی که با آن شروع می‌شوند زنده می‌مانند؛ داخل :is/:where/:not/:has بررسی نمی‌شود. متن بقیهٔ CSS دست نمی‌خورد (برش با جای دقیق). */
let csstree = null; try{ csstree = require(path.join(__dirname, 'node_modules', 'css-tree')); }catch(e){}
function deadPruner(html){
  if(!csstree || process.env.NO_PRUNE) return null;
  let code = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
  try{ code += fs.readFileSync(path.join(path.dirname(src), 'i18n-en.js'), 'utf8'); }catch(e){}
  (html.match(/<script[^>]*\bsrc="([^"]+)"[^>]*data-inline/g) || []).forEach(t => { const f = /src="([^"]+)"/.exec(t)[1]; try{ code += fs.readFileSync(path.join(path.dirname(src), '..', f), 'utf8'); }catch(e){} });
  const words = new Set(code.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || []);
  const pre = new Set();
  (code.match(/['"`]([A-Za-z_][A-Za-z0-9_-]*)['"`]?\s*(\+|\$\{)/g) || []).forEach(x => { const k = /['"`]([A-Za-z_][A-Za-z0-9_-]*)/.exec(x); if(k && k[1].length >= 2) pre.add(k[1]); });
  (code.match(/([A-Za-z_][A-Za-z0-9_-]*)\$\{/g) || []).forEach(x => { const k = x.slice(0, -2); if(k.length >= 2) pre.add(k); });
  const P = Array.from(pre);
  const alive = t => words.has(t) || P.some(p => t.startsWith(p));
  return function prune(css){
    let ast; try{ ast = csstree.parse(css, {positions: true, parseValue: false, parseAtrulePrelude: false, parseCustomProperty: false}); }catch(e){ return {css, n: 0}; }
    const cut = [];
    csstree.walk(ast, {visit: 'Rule', enter(node){
      if(!node.loc || !node.prelude || node.prelude.type !== 'SelectorList') return;
      const sels = node.prelude.children.toArray(); if(!sels.length) return;
      const dead = sels.every(sel => { let d = false; csstree.walk(sel, {enter(n){ if(d) return;
        if(n.type === 'PseudoClassSelector' && /^(is|where|not|has|host|nth-child|nth-last-child)$/.test(n.name)) return csstree.walk.skip;
        if((n.type === 'ClassSelector' || n.type === 'IdSelector') && !alive(n.name)) d = true; }}); return d; });
      if(dead) cut.push([node.loc.start.offset, node.loc.end.offset]); }});
    if(!cut.length) return {css, n: 0};
    cut.sort((a, b) => b[0] - a[0]); let o = css; cut.forEach(([a, b]) => { o = o.slice(0, a) + o.slice(b); });
    return {css: o, n: cut.length};
  };
}
(async () => {
  const prune = deadPruner(html); let pruned = 0;
  const parts = []; let last = 0;
  const re = /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g; let m;
  let jsIn = 0, jsOut = 0, cssIn = 0, cssOut = 0;
  while((m = re.exec(html))){
    parts.push(html.slice(last, m.index)); last = re.lastIndex;
    const [all, tag, attrs = '', body] = m;
    if(tag === 'style'){ let body2 = body; if(prune){ const r0 = prune(body); body2 = r0.css; pruned += r0.n; } const b = cssMin(body2); cssIn += body.length; cssOut += b.length; parts.push('<style' + attrs + '>' + b + '</style>'); continue; }
    /* <script src="…" data-inline>: فایل مشترک lib/… در صفحهٔ اصلی درج می‌شود (یک منبع برای صفحهٔ اصلی و نقشه‌خوان) */
    let bodyX = body; const inl = /\bdata-inline\b/.test(attrs) && /\bsrc="([^"]+)"/.exec(attrs);
    if(inl){ bodyX = fs.readFileSync(require('path').join(require('path').dirname(src), '..', inl[1]), 'utf8'); }
    else if(/\bsrc=/.test(attrs) || /type="(?!text\/javascript|module)/.test(attrs) || !body.trim()){ parts.push(all); continue; }
    if(inl){ const r = await minify(bodyX, {ecma: 2020, compress: {passes: 1}, mangle: true}); jsIn += bodyX.length; jsOut += r.code.length; parts.push('<script>' + r.code + '</script>'); continue; }
    const r = await minify(body, { ecma: 2020, module: false, toplevel: false, compress: { passes: 1, unsafe: false, keep_fargs: true, keep_fnames: true, drop_console: false, pure_getters: false, hoist_funs: false, reduce_funcs: false, inline: 1, sequences: false }, mangle: { keep_fnames: true }, format: { comments: false, ascii_only: false } });
    jsIn += body.length; jsOut += r.code.length;
    parts.push('<script' + attrs + '>' + r.code + '</script>');
  }
  parts.push(html.slice(last));
  let outHtml = parts.join('');
  /* توضیح‌های HTML (به‌جز شرطی) */
  outHtml = outHtml.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  /* نشانهٔ «ساخته‌شده»: این فایل را ویرایش نکنید؛ منبع src/index.html است */
  outHtml = outHtml.replace(/^(<!doctype html>)/i, '$1<!-- built from src/index.html — edit the source, then tools/build.sh -->');
  fs.writeFileSync(out, outHtml);
  const kb = n => Math.round(n / 1024);
  console.log('JS', kb(jsIn), '→', kb(jsOut), 'KB | CSS', kb(cssIn), '→', kb(cssOut), 'KB (' + pruned + ' dead rules) | total', kb(Buffer.byteLength(html)), '→', kb(Buffer.byteLength(outHtml)), 'KB');
})().catch(e => { console.error(e); process.exit(1); });
