/* صحنه‌های مشترک آزمون‌های ظاهر (overlap.js، ux.js): [نام، کاری که صفحه را به آن حالت می‌برد، ریشهٔ سنجش (اختیاری)]. کارت یا پنجرهٔ تازه این‌جا اضافه شود. */
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
  /* ۶۴۷: تطبیق و اصلاح داده‌ها (یک‌جا) و اطلاعات پایهٔ پروژه */
  ['hub-match', () => { window.dcOpen('names'); }, '.phb-m'],
  ['hub-loc', () => { window.dcOpen('loc'); }, '.phb-m'],
  ['hub-disc', () => { window.dcOpen('disc'); }, '.phb-m'],
  ['hub-base', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('.phb-n [data-cdxtab="base"]'); b && b.click(); }, 700); }, '.phb-m'],
  /* ۶۴۶: فرم پرونده (مشخصات، تماس و بانکی، اسناد عمومی) و پروندهٔ تازه */
  ['ctc-names', () => { ctcOpen('تأسیسات نوین'); }, '#ctcModal'],
  ['ctc-contact', () => { ctcOpen('تأسیسات نوین'); setTimeout(() => { const b = document.querySelector('#ctcModal .ctx-nav [data-ctxjump="contact"]'); b && b.click(); }, 400); }, '#ctcModal'],
  ['ctc-gdocs', () => { ctcOpen('تأسیسات نوین'); setTimeout(() => { const b = document.querySelector('#ctcModal .ctx-nav [data-ctxjump="gdocs"]'); b && b.click(); }, 400); }, '#ctcModal'],
  ['ctc-new', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('[data-cdxnew="1"]'); b && b.click(); }, 700); }, '#ctcModal'],
  /* ۶۴۵: کنسول مدیریت و قابلیت‌های هر نفر */
  ['ac-docs', () => { window.acOpen('docs'); }, '#acM'],
  ['ac-feat', () => { window.acOpen('acc'); setTimeout(() => { const b = document.querySelector('#acM [data-acrun="feat"]'); b && b.click(); setTimeout(() => { const p = document.querySelector('[data-pcp]'); p && p.click(); }, 900); }, 400); }, '.pp-mods'],
  /* ۶۴۳–۶۴۴: بخش‌های مرکز پرونده‌ها */
  ['hub-list', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('.phb-n [data-cdxtab="list"]'); b && b.click(); }, 700); }, '.phb-tbl'],
  ['hub-fin', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('.phb-n [data-cdxtab="fin"]'); b && b.click(); }, 700); }, '.phb-fsum'],
  ['hub-org', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('.phb-n [data-cdxtab="org"]'); b && b.click(); setTimeout(() => { const c = document.querySelector('.tms [data-tmpos]'); c && c.click(); }, 300); }, 700); }, '.tms-ed'],
  ['ctr-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('[data-cdxprof]'); if(b) b.click(); else { let n = ''; try{ n = (kxStats()[0] || {}).name || ''; }catch(e){} if(!n){ const o = document.querySelector('#contractorList option'); n = o ? o.value : ''; } if(n) openContractorProfile(n); } setTimeout(() => { const h = document.querySelector('#ctProfModal .mc-head'); h && h.insertAdjacentHTML('afterend', '<div class="ct-alias2">با نام‌های: کارفرمای پروژه، نام دیگر پیمانکار</div>'); }, 900); }, 600); }, '#ctProfModal'],
  /* ۶۰۸: کارت کارفرما و مشاور (نوع ثبت‌شده در پرونده؛ دادهٔ mock) */
  ['client-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const x = document.createElement('button'); x.dataset.hrprof = 'شرکت توسعهٔ آریا'; document.body.appendChild(x); x.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); x.click(); x.remove(); }, 600); }, '#ctProfModal'],
  ['cons-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const x = document.createElement('button'); x.dataset.hrprof = 'مهندسین مشاور پارس طرح'; document.body.appendChild(x); x.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); x.click(); x.remove(); }, 600); }, '#ctProfModal'],
  /* ۶۰۸: کارت فعالیت (دک)، کارت پرسنل، کنسول مدیریت و چند بخش میز کار */
  ['deck', () => { switchTab('admin'); admSetCat('statement'); setTimeout(() => { window.deckOpenAt && deckOpenAt('statement', 's5'); }, 500); }, '#deckModal'],
  ['person-card', () => { switchTab('home'); setTimeout(() => { window.openProfile ? openProfile('آقای بهرام نیک‌پور') : 0; }, 300); }, '#profileModal'],
  ['admin-console', () => { window.acOpen && acOpen(); }, '#acM'],
  ['hse', () => { switchTab('tasks'); wsSet('hse'); }],
  ['wh', () => { switchTab('tasks'); wsSet('wh'); }],
  ['qc', () => { switchTab('tasks'); wsSet('qc'); }],
  /* ۶۱۶: آرشیو (فهرست و کاشی) */
  ['archive', () => { try{ localStorage.setItem('siteLogM.arcView', 'list'); }catch(e){} switchTab('admin'); admSetCat('archive'); }, '#arcBody'],
  ['archive-grid', () => { switchTab('admin'); admSetCat('archive'); setTimeout(() => { const b = document.querySelector('#arcBody [data-arcv="grid"]'); b && b.click(); }, 500); }, '#arcBody'],
  ['forms', () => { window.arcOpenForm('fm1', 'forms'); }, '#arcBody'],
  ['transmittals', () => { window.arcOpenTab('trn'); }, '#arcBody'],
  ['trn-sec', () => { window.trnOpenSec(); }, '#trnBody'],
  ['new-doc', () => { switchTab('admin'); admSetCat('contract'); const x = document.createElement('button'); x.dataset.admquick = 'contract'; document.body.appendChild(x); x.click(); x.remove(); }, '.af'],
  ['xl', () => { switchTab('admin'); admSetCat('statement'); window.xlOpen && xlOpen('doc:statement'); }, '#xlHubM'],
];
module.exports = SCENES;
