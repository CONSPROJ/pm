/* آزمون پیش از انتشار: برنامه با دادهٔ ساختگی (mock.js، بی سرور واقعی) روی دسکتاپ و گوشی باز می‌شود،
   همهٔ بخش‌های اصلی را می‌گردد و هر خطای اجرایی (pageerror) یا اسکلتِ بارگذاری که نرفته باشد را گزارش می‌کند.
   خروج غیرصفر = انتشار متوقف. استفاده: node tools/test/smoke.js http://localhost:PORT/index.html */
const { chromium, devices } = require('playwright'); const { install } = require('./mock.js');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
(async () => {
  const b = await chromium.launch(); let bad = 0;
  for(const dev of ['desktop', 'phone']){
    const ctx = await b.newContext(dev === 'phone' ? devices['iPhone 13'] : {viewport:{width:1440, height:900}});
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await install(p);
    await p.addInitScript(() => { localStorage.setItem('siteLogM.user.v1','آقای مهدی نعیمی'); localStorage.setItem('siteLogM.tok.v1','x'.repeat(40)); localStorage.setItem('siteLogM.a2hs.v1','1');
      const g = Storage.prototype.getItem; Storage.prototype.getItem = function(k){ if(String(k).indexOf('siteLogM.tour.v1:') === 0) return '1'; return g.call(this, k); }; });
    await p.goto(URL); await p.waitForTimeout(7000);
    const S = [['home', () => switchTab('home')], ['docs', () => { switchTab('admin'); admSetCat('statement'); }], ['contract', () => admSetCat('contract')], ['design', () => admSetCat('design')],
      ['reports', () => { switchTab('view'); const x = document.getElementById('loadBtn'); x && x.click(); }], ['desk', () => { switchTab('tasks'); wsSet(''); }],
      ['tasks', () => wsSet('tasks')], ['wrk', () => wsSet('wrk')], ['hse', () => wsSet('hse')], ['qc', () => wsSet('qc')], ['wh', () => wsSet('wh')], ['sp', () => wsSet('sp')], ['qt', () => wsSet('qt')], ['ctr', () => wsSet('ctr')],
      ['newdoc', () => { switchTab('admin'); admSetCat('contract'); const x = document.createElement('button'); x.dataset.admquick = 'contract'; document.body.appendChild(x); x.click(); x.remove(); }],
      ['rc', () => { document.documentElement.classList.remove('nf-dr'); rcOpen(); }], ['la', () => { document.getElementById('rcModal').hidden = true; laOpen(); }]];
    for(const [n, f] of S){ try{ await p.evaluate(f); }catch(e){ errs.push(n + ': ' + e.message); } await p.waitForTimeout(1200);
      const skl = await p.evaluate(() => [...document.querySelectorAll('.skl')].filter(x => x.offsetParent).length); if(skl) errs.push(n + ': loading skeleton still visible'); }
    console.log(dev + ':', errs.length ? 'FAIL\n  ' + errs.slice(0, 8).join('\n  ') : 'ok'); bad += errs.length;
    await ctx.close();
  }
  await b.close(); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
