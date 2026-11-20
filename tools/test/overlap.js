/* آزمون روی‌هم‌افتادن متن (۶۰۲): صفحه‌ها و کارت‌های اصلی روی گوشی و دسکتاپ (روشن و تیره) باز می‌شوند و جای واقعی هر تکه متن
   (Range.getClientRects) با بقیه سنجیده می‌شود. دو متنِ جدا که بیش از ۳px روی هم بیفتند = خطا (نام صفحه، دو متن، جای برخورد).
   متن‌های داخل آواتار، نشان‌های عمداً روی‌هم (نقطهٔ پیام، شمارنده روی آیکن)، پنهان و بریده‌شده نادیده‌اند.
   استفاده: node tools/test/overlap.js http://localhost:PORT/index.html  — خروج غیرصفر یعنی برخورد پیدا شد. */
const { chromium, devices } = require('playwright'); const { install } = require('./mock.js');
const URL = process.argv[2] || 'http://localhost:8799/index.html';
const ONLY = process.argv[3] || '';

/* داخل صفحه اجرا می‌شود */
function detect(rootSel){
  /* از چند مورد هم‌نام، بزرگ‌ترینِ پیدا */
  const root = rootSel ? Array.from(document.querySelectorAll(rootSel)).filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0] : document.body;
  if(!root) return {err: 'root not found: ' + rootSel};
  const SKIP = '.ava, .ava-mg, .msg-dot, [aria-hidden="true"], .sr-only, svg, .shr-toast, .ms-avs, .ms-rjx, .tk-badge, .nb-dot, i.n, .dot, .badge-n, .h3-seg i, .kcap i, .ws-n, .sb-n, .ct-cam, .xlh-prog, script, style, template, select, option, datalist';
  const vis = el => { for(let e = el, prev = null; e && e !== document.documentElement; prev = e, e = e.parentElement){ const c = getComputedStyle(e); if(c.display === 'none' || c.visibility === 'hidden' || +c.opacity < .05) return false;
      /* <details> بسته: فقط summary دیده می‌شود */
      if(e.tagName === 'DETAILS' && !e.open && prev && prev.tagName !== 'SUMMARY') return false; } return true; };
  /* لایهٔ ثابت/چسبان (نوار پایین، سربرگ چسبان): محتوا عمداً از زیرش رد می‌شود — برخورد دو لایهٔ جدا حساب نمی‌شود */
  const layerOf = el => { for(let e = el; e && e !== document.body; e = e.parentElement){ const ps = getComputedStyle(e).position; if(ps === 'fixed' || ps === 'sticky') return e; } return null; };
  /* کادرِ بُرشِ نزدیک‌ترین والدِ overflow غیرvisible */
  const clipOf = el => { let r = {left: -1e9, top: -1e9, right: 1e9, bottom: 1e9}; for(let e = el.parentElement; e && e !== document.body; e = e.parentElement){ const c = getComputedStyle(e);
      if(c.overflowX !== 'visible' || c.overflowY !== 'visible'){ const b = e.getBoundingClientRect(); r = {left: Math.max(r.left, b.left), top: Math.max(r.top, b.top), right: Math.min(r.right, b.right), bottom: Math.min(r.bottom, b.bottom)}; } } return r; };
  const items = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT});
  let n, cnt = 0;
  while((n = tw.nextNode()) && cnt < 6000){
    const el = n.parentElement; if(!el || el.closest(SKIP)) continue;
    if(!vis(el)) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    const cl = clipOf(el);
    Array.from(rg.getClientRects()).forEach(r => {
      const x = {left: Math.max(r.left, cl.left), top: Math.max(r.top, cl.top), right: Math.min(r.right, cl.right), bottom: Math.min(r.bottom, cl.bottom)};
      if(x.right - x.left < 2 || x.bottom - x.top < 4) return;
      if(x.bottom < 0 || x.top > innerHeight * 3) return;
      /* ارتفاع خط واقعی کمی کمتر از کادر متن است؛ ۲۰٪ از بالا و پایین کم می‌شود تا خط‌های پشت‌سرهم برخورد حساب نشوند */
      const h = x.bottom - x.top, sh = h * .2;
      items.push({el, ly: layerOf(el), t: n.nodeValue.trim().slice(0, 28), l: x.left, r: x.right, t0: x.top + sh, b: x.bottom - sh, rl: r.left, rr: r.right}); cnt++;
    });
  }
  const out = [];
  for(let i = 0; i < items.length; i++) for(let j = i + 1; j < items.length; j++){
    const a = items[i], b = items[j]; if(a.el === b.el || a.ly !== b.ly) continue;
    const ow = Math.min(a.r, b.r) - Math.max(a.l, b.l), oh = Math.min(a.b, b.b) - Math.max(a.t0, b.t0);
    if(ow > 3 && oh > 3){
      /* یکی جلوی دیگری است (پنجرهٔ باز روی صفحه): فقط اگر هر دو در یک لایه‌اند */
      const top = document.elementFromPoint((Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2, (Math.max(a.t0, b.t0) + Math.min(a.b, b.b)) / 2);
      if(top && !(a.el.contains(top) || top.contains(a.el) || b.el.contains(top) || top.contains(b.el))) continue;
      const path = e => { const p = []; for(let k = 0; e && k < 3; k++, e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join('>'); };
      out.push('«' + a.t + '» × «' + b.t + '»  [' + path(a.el) + ' | ' + path(b.el) + '] @' + Math.round(Math.max(a.l, b.l)) + ',' + Math.round(Math.max(a.t0, b.t0)));
    }
  }
  /* ۶۰۳: متن داخل چیپ/دکمه (قاب گرد کوچک با زمینه یا حاشیه) به لبه نچسبد و بریده نشود */
  const boxOf = el => { for(let e = el, k = 0; e && k < 4; e = e.parentElement, k++){ const c = getComputedStyle(e), b = e.getBoundingClientRect();
      if(parseFloat(c.borderTopLeftRadius) >= 8 && b.width < 360 && b.height < 56 && b.height > 14 && (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth) > 0 || c.boxShadow !== 'none')) return {e, b, c}; } return null; };
  const seenBox = new Set();
  items.forEach(it => { const bx = boxOf(it.el); if(!bx || seenBox.has(bx.e)) return;
    /* ردیف اسکرول‌خور افقی (زبانه‌ها): بریدن لبه عمدی است */
    if(/auto|scroll/.test(bx.c.overflowX) && bx.e.scrollWidth > bx.e.clientWidth + 1) return;
    const pl = Math.min(it.rl, it.l) - bx.b.left, pr = bx.b.right - Math.max(it.rr, it.r);
    if((pl < 2 || pr < 2) && bx.c.textOverflow !== 'ellipsis'){ seenBox.add(bx.e);
      out.push('لبه: «' + it.t + '» ' + (Math.min(pl, pr) < 0 ? 'بریده شده' : 'به لبهٔ قاب چسبیده') + ' (' + Math.round(Math.min(pl, pr)) + 'px) [' + bx.e.tagName.toLowerCase() + '.' + String(bx.e.className || '').trim().split(/\s+/).slice(0, 2).join('.') + ']'); } });
  return {n: items.length, hits: Array.from(new Set(out)).slice(0, 30)};
}

const SCENES = [
  ['home', () => switchTab('home')],
  ['docs', () => { switchTab('admin'); admSetCat('statement'); }],
  ['doc-card', () => { switchTab('admin'); admSetCat('statement'); setTimeout(() => { const r = [...document.querySelectorAll('#adminView button.afr')].find(e => e.offsetParent); r && r.click(); }, 600); }, '#adminView'],
  ['contract', () => { switchTab('admin'); admSetCat('contract'); }],
  ['design', () => { switchTab('admin'); admSetCat('design'); }],
  ['minute', () => { switchTab('admin'); admSetCat('minute'); }],
  ['reports', () => { switchTab('view'); const x = document.getElementById('loadBtn'); x && x.click(); }],
  ['desk', () => { switchTab('tasks'); wsSet(''); }],
  ['tasks', () => { switchTab('tasks'); wsSet('tasks'); }],
  ['wrk', () => { switchTab('tasks'); wsSet('wrk'); }],
  ['people', () => { switchTab('tasks'); wsSet('ctr'); }],
  ['ctr-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('[data-cdxprof]'); b && b.click(); setTimeout(() => { const h = document.querySelector('#ctProfModal .mc-head'); h && h.insertAdjacentHTML('afterend', '<div class="ct-alias2">با نام‌های: کارفرمای پروژه، نام دیگر پیمانکار</div>'); }, 900); }, 600); }, '#ctProfModal'],
  ['new-doc', () => { switchTab('admin'); admSetCat('contract'); const x = document.createElement('button'); x.dataset.admquick = 'contract'; document.body.appendChild(x); x.click(); x.remove(); }, '.af'],
  ['xl', () => { switchTab('admin'); admSetCat('statement'); window.xlOpen && xlOpen('doc:statement'); }, '#xlHubM'],
];

(async () => {
  const b = await chromium.launch(); let bad = 0;
  const THEMES = (process.env.OV_THEMES || 'light,dark').split(',');
  for(const dev of ['phone', 'desktop']) for(const th of THEMES){
    const ctx = await b.newContext(Object.assign(dev === 'phone' ? devices['iPhone 13'] : {viewport: {width: 1440, height: 900}}, {colorScheme: th}));
    /* یک بار بارگذاری برای هر حالت؛ صحنه‌ها پشت سر هم، بعد از هر صحنه پنجره‌های باز بسته می‌شوند */
    const p = await ctx.newPage(); await install(p);
    await p.addInitScript(() => { localStorage.setItem('siteLogM.user.v1', 'آقای مهدی نعیمی'); localStorage.setItem('siteLogM.tok.v1', 'x'.repeat(40)); localStorage.setItem('siteLogM.a2hs.v1', '1');
      const g = Storage.prototype.getItem; Storage.prototype.getItem = function(k){ if(String(k).indexOf('siteLogM.tour.v1:') === 0) return '1'; return g.call(this, k); }; });
    await p.goto(URL); await p.waitForTimeout(6500);
    await p.evaluate(t => { document.documentElement.dataset.theme = t; }, th);
    /* OV_CSS: برای سنجیدن خود آزمون (خراب کردن عمدی) */
    if(process.env.OV_CSS) await p.addStyleTag({content: process.env.OV_CSS});
    for(const [name, fn, sel] of SCENES){
      if(ONLY && name !== ONLY) continue;
      try{ await p.evaluate(fn); }catch(e){ console.log(dev, th, name, 'scene error', e.message); }
      await p.waitForTimeout(2400);
      await p.evaluate(() => { document.getElementById('a2hsModal')?.remove(); document.querySelectorAll('.shr-toast').forEach(x => x.remove()); });
      const r = await p.evaluate(detect, sel || '');
      if(r.err){ console.log(dev, th, name, r.err); }
      else if(r.hits.length){ bad += r.hits.length; console.log('✕ ' + dev + ' ' + th + ' ' + name + ' (' + r.hits.length + ')'); r.hits.slice(0, 12).forEach(h => console.log('    ' + h)); }
      else console.log('✓ ' + dev + ' ' + th + ' ' + name + ' (' + r.n + ' متن)');
      await p.evaluate(() => { document.getElementById('ctProfModal')?.remove(); document.body.classList.remove('ctp-open'); document.body.style.overflow = '';
        document.querySelectorAll('.modal-bg:not([hidden])').forEach(m => { m.hidden = true; }); window.scrollTo(0, 0); });
    }
    await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
