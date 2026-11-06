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
(async () => {
  const parts = []; let last = 0;
  const re = /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g; let m;
  let jsIn = 0, jsOut = 0, cssIn = 0, cssOut = 0;
  while((m = re.exec(html))){
    parts.push(html.slice(last, m.index)); last = re.lastIndex;
    const [all, tag, attrs = '', body] = m;
    if(tag === 'style'){ const b = cssMin(body); cssIn += body.length; cssOut += b.length; parts.push('<style' + attrs + '>' + b + '</style>'); continue; }
    if(/\bsrc=/.test(attrs) || /type="(?!text\/javascript|module)/.test(attrs) || !body.trim()){ parts.push(all); continue; }
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
  console.log('JS', kb(jsIn), '→', kb(jsOut), 'KB | CSS', kb(cssIn), '→', kb(cssOut), 'KB | total', kb(Buffer.byteLength(html)), '→', kb(Buffer.byteLength(outHtml)), 'KB');
})().catch(e => { console.error(e); process.exit(1); });
