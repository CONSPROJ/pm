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
  ['ctr-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const b = document.querySelector('[data-cdxprof]'); b && b.click(); setTimeout(() => { const h = document.querySelector('#ctProfModal .mc-head'); h && h.insertAdjacentHTML('afterend', '<div class="ct-alias2">با نام‌های: کارفرمای پروژه، نام دیگر پیمانکار</div>'); }, 900); }, 600); }, '#ctProfModal'],
  /* ۶۰۸: کارت کارفرما و مشاور (نوع ثبت‌شده در پرونده؛ دادهٔ mock) */
  ['client-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const x = document.createElement('button'); x.dataset.hrprof = 'شرکت توسعهٔ آریا'; document.body.appendChild(x); x.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); x.click(); x.remove(); }, 600); }, '#ctProfModal'],
  ['cons-card', () => { switchTab('tasks'); wsSet('ctr'); setTimeout(() => { const x = document.createElement('button'); x.dataset.hrprof = 'مهندسین مشاور پارس طرح'; document.body.appendChild(x); x.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})); x.click(); x.remove(); }, 600); }, '#ctProfModal'],
  /* ۶۰۸: کارت فعالیت (دک)، کارت پرسنل، کنسول مدیریت و چند بخش میز کار */
  ['deck', () => { switchTab('admin'); admSetCat('statement'); setTimeout(() => { window.deckOpenAt && deckOpenAt('statement', 's5'); }, 500); }, '#deckModal'],
  ['person-card', () => { switchTab('home'); setTimeout(() => { window.openProfile ? openProfile('آقای امیر ابراهیمی') : 0; }, 300); }, '#profileModal'],
  ['admin-console', () => { window.acOpen && acOpen(); }, '#acM'],
  ['hse', () => { switchTab('tasks'); wsSet('hse'); }],
  ['wh', () => { switchTab('tasks'); wsSet('wh'); }],
  ['qc', () => { switchTab('tasks'); wsSet('qc'); }],
  /* ۶۱۶: آرشیو (فهرست و کاشی) */
  ['archive', () => { try{ localStorage.setItem('siteLogM.arcView', 'list'); }catch(e){} switchTab('admin'); admSetCat('archive'); }, '#arcBody'],
  ['archive-grid', () => { switchTab('admin'); admSetCat('archive'); setTimeout(() => { const b = document.querySelector('#arcBody [data-arcv="grid"]'); b && b.click(); }, 500); }, '#arcBody'],
  ['forms', () => { window.arcOpenForm('fm1', 'forms'); }, '#arcBody'],
  ['new-doc', () => { switchTab('admin'); admSetCat('contract'); const x = document.createElement('button'); x.dataset.admquick = 'contract'; document.body.appendChild(x); x.click(); x.remove(); }, '.af'],
  ['xl', () => { switchTab('admin'); admSetCat('statement'); window.xlOpen && xlOpen('doc:statement'); }, '#xlHubM'],
];
module.exports = SCENES;
