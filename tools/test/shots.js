/* عکس صفحه‌ها برای بازبینی ظاهر: همان مسیرهای smoke.js با دادهٔ ساختگی، روی دسکتاپ و گوشی.
   استفاده: node tools/test/shots.js http://localhost:PORT/index.html پوشهٔ‌خروجی [desktop,phone] */
const { chromium, devices } = require('playwright'); const { install } = require('./mock.js');
const URL = process.argv[2]; const OUT = (process.argv[3] || 'shots') + '/'; const only = process.argv[4] || 'desktop,phone'; const DARK = process.argv[5] === 'dark';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for(const dev of only.split(',')){
    const ctx = await b.newContext(dev === 'phone' ? Object.assign({}, devices['iPhone 13'], DARK ? {colorScheme:'dark'} : {}) : Object.assign({viewport:{width:1440, height:900}}, DARK ? {colorScheme:'dark'} : {}));
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await install(p);
    await p.addInitScript(() => { localStorage.setItem('siteLogM.user.v1','آقای کاوه رستمی'); localStorage.setItem('siteLogM.tok.v1','x'.repeat(40)); localStorage.setItem('siteLogM.a2hs.v1','1');
      const g = Storage.prototype.getItem; Storage.prototype.getItem = function(k){ if(String(k).indexOf('siteLogM.tour.v1:') === 0) return '1'; return g.call(this, k); }; });
    await p.goto(URL); await p.waitForTimeout(7000);
    const S = [['home', () => switchTab('home')], ['docs', () => { switchTab('admin'); admSetCat('statement'); }], ['contract', () => admSetCat('contract')], ['design', () => admSetCat('design')],
      ['reports', () => { switchTab('view'); const x = document.getElementById('loadBtn'); x && x.click(); }], ['desk', () => { switchTab('tasks'); wsSet(''); }],
      ['tasks', () => wsSet('tasks')], ['wrk', () => wsSet('wrk')], ['hse', () => wsSet('hse')], ['qc', () => wsSet('qc')], ['wh', () => wsSet('wh')], ['sp', () => wsSet('sp')], ['qt', () => wsSet('qt')], ['ctr', () => wsSet('ctr')],
      ['newdoc', () => { switchTab('admin'); admSetCat('contract'); const x = document.createElement('button'); x.dataset.admquick = 'contract'; document.body.appendChild(x); x.click(); x.remove(); }],
      ['rc', () => { document.documentElement.classList.remove('nf-dr'); rcOpen(); }], ['la', () => { document.getElementById('rcModal').hidden = true; laOpen(); }]];
    for(const [n, f] of S){
      try{ await p.evaluate(f); }catch(e){ errs.push(n + ': ' + e.message); }
      await p.waitForTimeout(1500);
      await p.evaluate(() => { const m = document.getElementById('a2hsModal'); m && m.remove(); document.querySelectorAll('.shr-toast').forEach(x => x.remove()); });
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await p.screenshot({path: OUT + (DARK ? 'dark-' : '') + dev + '-' + n + '.png'}); console.log(dev, n, 'overflowX', ov);
    }
    console.log(dev, 'errors', errs); await ctx.close();
  }
  await b.close();
})();
