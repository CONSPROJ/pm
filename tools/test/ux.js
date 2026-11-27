/* بازبینی کاربرپذیری (۶۰۷): همان صحنه‌های overlap.js روی گوشی (روشن و تیره)؛ سه سنجه:
   ۱) جای لمس: دکمه/پیوند پیدا کوچک‌تر از ۳۲×۳۲px (با فاصلهٔ کافی از دکمهٔ کناری چشم‌پوشی نمی‌شود)
   ۲) تضاد رنگ متن با زمینهٔ واقعی (زنجیرهٔ والدها): زیر ۴٫۵ برای متن ریز، زیر ۳ برای متن درشت (≥۱۸px یا ≥۱۴px پررنگ)
   ۳) دکمهٔ فقط‌آیکون بی نام (aria-label/title/متن)
   گزارش: هر صحنه شمار هر مورد و چند نمونه. استفاده: node tools/test/ux.js URL [صحنه] — خروجی فقط گزارش است (انتشار را نمی‌بندد). */
const { chromium, devices } = require('playwright'); const { install } = require('./mock.js');
const URL = process.argv[2] || 'http://localhost:8799/index.html', ONLY = process.argv[3] || '';
const SCENES = require('./scenes.js');

function audit(rootSel){
  const root = rootSel ? Array.from(document.querySelectorAll(rootSel)).filter(e => e.getClientRects().length).sort((a, b) => { const A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return B.width * B.height - A.width * A.height; })[0] : document.body;
  if(!root) return {err: 'root'};
  const vis = el => { for(let e = el; e && e !== document.documentElement; e = e.parentElement){ const c = getComputedStyle(e); if(c.display === 'none' || c.visibility === 'hidden' || +c.opacity < .05) return false; if(e.tagName === 'DETAILS' && !e.open) return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight * 3; };
  const name = e => (e.className && typeof e.className === 'string' ? e.tagName.toLowerCase() + '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
  const txt = e => (e.innerText || e.getAttribute('aria-label') || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  /* ۱ و ۳ */
  const tap = [], noname = [];
  root.querySelectorAll('button, a[href], [role="button"], summary, input[type="checkbox"], input[type="radio"], select').forEach(b => {
    if(!vis(b) || b.closest('[aria-hidden="true"]') || b.disabled) return;
    const r = b.getBoundingClientRect();
    /* لمس: خود عنصر یا ناحیهٔ لمس بزرگ‌ترش (برچسب والد) */
    let w = r.width, h = r.height; const lab = b.closest('label'); if(lab){ const lr = lab.getBoundingClientRect(); w = Math.max(w, lr.width); h = Math.max(h, lr.height); }
    if((w < 32 || h < 32) && !b.closest('.ava, .msg-dot')) tap.push(name(b) + ' «' + txt(b) + '» ' + Math.round(w) + '×' + Math.round(h));
    const t = (b.innerText || '').trim();
    if(!t && !b.getAttribute('aria-label') && !b.title && !b.querySelector('img[alt]:not([alt=""])') && b.tagName !== 'SELECT' && b.type !== 'checkbox' && b.type !== 'radio') noname.push(name(b));
  });
  /* ۲ تضاد */
  const rgb = s => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const bgOf = el => { let acc = null; for(let e = el; e; e = e.parentElement){ const c = getComputedStyle(e); if(c.backgroundImage && c.backgroundImage !== 'none' && !/gradient/.test(c.backgroundImage)) return null; const b = rgb(c.backgroundColor); if(b && b[3] > 0){ if(b[3] >= .95) return acc ? [acc[0] * acc[3] + b[0] * (1 - acc[3]), acc[1] * acc[3] + b[1] * (1 - acc[3]), acc[2] * acc[3] + b[2] * (1 - acc[3]), 1] : b; acc = acc || b; } }
    return rgb(getComputedStyle(document.body).backgroundColor); };
  const low = []; const seen = new Set();
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.nodeValue.trim().length > 1 ? 1 : 2}); let n, k = 0;
  while((n = tw.nextNode()) && k < 4000){ const el = n.parentElement; if(!el || seen.has(el)) continue; seen.add(el); k++;
    if(!vis(el) || el.closest('.ava, .ava-mg, svg, [aria-hidden="true"], input, textarea, select, .skl')) continue;
    const c = getComputedStyle(el); const fg = rgb(c.color); if(!fg) continue; const bg = bgOf(el); if(!bg) continue;
    const a = fg[3] * (+c.opacity || 1); const f = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
    const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const big = parseFloat(c.fontSize) >= 18 || (parseFloat(c.fontSize) >= 14 && +c.fontWeight >= 700);
    if(ratio < (big ? 3 : 4.5)) low.push(name(el) + ' «' + n.nodeValue.trim().slice(0, 20) + '» ' + ratio.toFixed(2) + (big ? ' (درشت)' : ''));
  }
  return {tap, noname, low};
}

(async () => {
  const b = await chromium.launch(); const sum = {tap: 0, noname: 0, low: 0};
  for(const th of (process.env.UX_THEMES || 'light,dark').split(',')){
    const ctx = await b.newContext(Object.assign({}, devices['iPhone 13'], {colorScheme: th}));
    const p = await ctx.newPage(); await install(p);
    await p.addInitScript(() => { localStorage.setItem('siteLogM.user.v1', 'آقای کاوه رستمی'); localStorage.setItem('siteLogM.tok.v1', 'x'.repeat(40)); localStorage.setItem('siteLogM.a2hs.v1', '1');
      const g = Storage.prototype.getItem; Storage.prototype.getItem = function(k){ if(String(k).indexOf('siteLogM.tour.v1:') === 0) return '1'; return g.call(this, k); }; });
    await p.goto(URL); await p.waitForTimeout(6500); await p.evaluate(t => { document.documentElement.dataset.theme = t; }, th);
    for(const [nm, fn, sel] of SCENES){
      if(ONLY && nm !== ONLY) continue;
      try{ await p.evaluate(fn); }catch(e){}
      await p.waitForTimeout(2400);
      await p.evaluate(() => { document.getElementById('a2hsModal')?.remove(); document.querySelectorAll('.shr-toast').forEach(x => x.remove()); });
      const r = await p.evaluate(audit, sel || '');
      if(!r.err){ sum.tap += r.tap.length; sum.noname += r.noname.length; sum.low += r.low.length;
        console.log('— ' + th + ' ' + nm + ': لمس ' + r.tap.length + ' · تضاد ' + r.low.length + ' · بی‌نام ' + r.noname.length);
        const uniq = a => Array.from(new Set(a)).slice(0, 6); uniq(r.tap).forEach(x => console.log('   لمس  ' + x)); uniq(r.low).forEach(x => console.log('   تضاد ' + x)); uniq(r.noname).forEach(x => console.log('   بی‌نام ' + x)); }
      await p.evaluate(() => { document.getElementById('ctProfModal')?.remove(); document.getElementById('acM')?.remove(); document.getElementById('deckModal') && (document.getElementById('deckModal').hidden = true); document.body.classList.remove('ctp-open'); document.body.style.overflow = ''; document.querySelectorAll('.modal-bg:not([hidden])').forEach(m => { m.hidden = true; }); window.scrollTo(0, 0); });
    }
    await ctx.close();
  }
  console.log('جمع: لمس ' + sum.tap + ' · تضاد ' + sum.low + ' · بی‌نام ' + sum.noname);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
