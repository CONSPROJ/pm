// Fake Supabase for screenshots: intercepts /rest/v1/* and returns sample project data.
const FA = '۰۱۲۳۴۵۶۷۸۹';
const toEn = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d));
function todayFa(){
  const f = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  return toEn(f).replace(/[^\d/]/g, '');
}
function addDays(fa, n){
  // approximate Shamsi arithmetic: months 1-6 have 31 days, 7-11 have 30, 12 has 29
  let [y, m, d] = fa.split('/').map(Number);
  const dim = mm => mm <= 6 ? 31 : (mm <= 11 ? 30 : 29);
  d += n;
  while(d < 1){ m--; if(m < 1){ m = 12; y--; } d += dim(m); }
  while(d > dim(m)){ d -= dim(m); m++; if(m > 12){ m = 1; y++; } }
  return y + '/' + String(m).padStart(2, '0') + '/' + String(d).padStart(2, '0');
}
const T0 = todayFa();
const CTR = ['شرکت آرمان سازه', 'پیمانکار حسینی', 'گروه برق پارس', 'تأسیسات نوین', 'نمای سنگ البرز', 'بتن آماده تهران', 'امانی', 'شرکت کاشی نگین'];
const SK = {'شرکت آرمان سازه': 'آرماتوربندی', 'پیمانکار حسینی': 'بنایی', 'گروه برق پارس': 'برق', 'تأسیسات نوین': 'تأسیسات مکانیکی', 'نمای سنگ البرز': 'نماکاری', 'بتن آماده تهران': 'بتن‌ریزی', 'امانی': 'کارگر ساده', 'شرکت کاشی نگین': 'کاشی‌کاری'};
const ENG = ['آقای مهدی نعیمی', 'آقای امیر ابراهیمی', 'آقای پارسا محمودی'];
let rnd = 7; const R = n => { rnd = (rnd * 9301 + 49297) % 233280; return Math.floor(rnd / 233280 * n); };
const activities = [], issues = [];
let aid = 1, iid = 1;
for(let k = 0; k < 35; k++){
  const d = addDays(T0, -k);
  CTR.forEach((c, j) => {
    if((k + j) % 5 === 4) return;
    const fl = 1 + (j * 3 + k) % 16;
    activities.push({id: aid++, report_id: 'r' + k, created_at: '2026-10-' + String(28 - (k % 27)).padStart(2, '0') + 'T08:00:00+00:00', date_fa: d, project: 'رویال آدرس رزیدنس',
      engineer: ENG[j % 3], contractor: c, skill: SK[c], ostad: String(1 + R(4)), shagerd: String(2 + R(7)), zone: 'طبقه ' + fl, subzone: ['لابی', 'راهرو', 'واحد ' + (fl * 100 + 1), ''][R(4)],
      activity: ['اجرای ' + SK[c] + ' محور B', 'ادامهٔ ' + SK[c] + ' طبقهٔ ' + fl, SK[c] + ' دیوارهای شمالی'][R(3)], photos: null});
  });
  if(k % 2 === 0) issues.push({id: iid++, report_id: 'r' + k, created_at: '2026-10-20T08:00:00+00:00', date_fa: d, project: 'رویال آدرس رزیدنس', engineer: ENG[k % 3],
    text: ['کمبود میلگرد در کارگاه', 'تأخیر در تحویل قالب', 'نقشهٔ اجرایی نما نرسیده'][k % 3], zone: 'طبقه ' + (1 + k % 9), who: CTR[k % 6], photos: null});
}
const st = [], ct = [], lt = [], mn = [], ds = [], tk = [];
for(let i = 1; i <= 220; i++){ const c = CTR[i % 7]; const amt = (1 + R(9)) * 850000000; const paid = i % 3 === 0 ? amt : (i % 3 === 1 ? Math.round(amt * 0.4) : 0);
  st.push({id: 's' + i, created_at: '2026-09-01T08:00:00+00:00', date_fa: addDays(T0, -i * 7), project: 'رویال آدرس رزیدنس', engineer: ENG[i % 3], contract_name: 'قرارداد ' + SK[c], party: c, contract_no: 'C-' + (100 + i % 7),
    number: String(1 + Math.floor(i / 3)), amount: String(amt), paid: String(paid), sent_date: addDays(T0, -i * 7), due_date: addDays(T0, -i * 7 + 20), notify: 'برون‌سازمانی',
    review: ['بررسی کارفرما', 'بررسی داخلی', 'تایید شده', 'بررسی پیمانکار'][i % 4], owner: ENG[i % 3], pay_status: paid >= amt ? 'پرداخت شده' : ''}); }
for(let i = 1; i <= 80; i++){ const c = CTR[i % 7]; ct.push({id: 'c' + i, created_at: '2026-06-01T08:00:00+00:00', date_fa: addDays(T0, -i * 20), project: 'رویال آدرس رزیدنس', engineer: ENG[i % 3], title: 'قرارداد ' + SK[c], number: 'C-' + (100 + i), party: c, subject: SK[c] + ' کل پروژه', amount: String((3 + R(20)) * 1000000000), start_date: addDays(T0, -i * 20), sent_date: addDays(T0, -i * 20), due_date: addDays(T0, 200 - i * 10), notify: 'برون‌سازمانی', review: ['تایید شده', 'بررسی کارفرما'][i % 2], owner: ENG[i % 3]}); }
for(let i = 1; i <= 400; i++){ lt.push({id: 'l' + i, created_at: '2026-10-01T08:00:00+00:00', date_fa: addDays(T0, -i * 2), project: 'رویال آدرس رزیدنس', engineer: ENG[i % 3], subject: ['درخواست تمدید زمان', 'اعلام تأخیر مصالح', 'ارسال نقشه‌های اصلاحی', 'صورت وضعیت شمارهٔ ' + i, 'دعوت به جلسهٔ هماهنگی'][i % 5], number: 'L-' + (2400 + i), party: CTR[i % 7], sent_date: addDays(T0, -i * 2), due_date: addDays(T0, -i * 2 + 10), notify: 'برون‌سازمانی', owner: ENG[i % 3], direction: i % 2 ? 'دریافتی' : 'ارسالی'}); }
for(let i = 1; i <= 120; i++){ mn.push({id: 'm' + i, meeting_id: 'M' + Math.ceil(i / 3), created_at: '2026-10-01T08:00:00+00:00', date_fa: addDays(T0, -i * 3), project: 'رویال آدرس رزیدنس', engineer: ENG[i % 3], subject: 'جلسهٔ هماهنگی هفتگی', meet_date: addDays(T0, -i * 3), category: 'اقدام', owner: CTR[i % 6], action_date: addDays(T0, -i * 3 + 7), idx: String(i % 3 + 1), text: ['تحویل نقشهٔ کارگاهی', 'تأمین نیروی اضافه برای طبقه ۵', 'رفع نواقص لوله‌کشی'][i % 3], notify: 'درون‌سازمانی', done: i % 4 === 0}); }
for(let i = 1; i <= 150; i++){ ds.push({id: 'd' + i, created_at: '2026-' + String(10 - (i % 5)).padStart(2, '0') + '-01T08:00:00+00:00', date_fa: addDays(T0, -i * 4), project: 'رویال آدرس رزیدنس', engineer: ENG[i % 3], title: ['نقشهٔ معماری طبقات', 'جزئیات نما', 'دیاگرام برق', 'نقشهٔ سازه'][i % 4], number: 'D-' + (300 + i), discipline: ['معماری', 'سازه', 'برق', 'مکانیک'][i % 4], revision: String(i % 3), party: 'مشاور طرح نو', sent_date: addDays(T0, -i * 4), status: ['نزد مشاور/کارفرما', 'تأیید شده', 'اصلاح و ارسال مجدد'][i % 3], notify: 'برون‌سازمانی', owner: ENG[i % 3], doc_type: 'نقشه'}); }
if(process.env.MOCK_REVS){ try{ ds[4].revs = require('fs').readFileSync(process.env.MOCK_REVS, 'utf8'); }catch(e){} }
for(let i = 1; i <= 700; i++){ const s = i % 5; tk.push({id: i, title: ['اجرای بلوک‌چینی طبقه ' + (i % 16 + 1), 'نصب داکت‌های تأسیسات', 'بتن‌ریزی سقف', 'کاشی‌کاری سرویس‌ها', 'لوله‌کشی آب و فاضلاب'][i % 5], created_by: ENG[i % 3], approved: true, owner1: i % 4 ? CTR[i % 6] : 'آقای مهدی نعیمی', owner2: '', side: 'اجرایی', position: 'طبقه ' + (i % 16 + 1),
  done: s === 0, doing: s === 1 || s === 2, not_done: s >= 3, start_date: addDays(T0, -30 + i % 20), due_date: addDays(T0, (i % 3 === 0 ? -5 : 10) + (i % 7)), blockers: '', category: ['سفت‌کاری', 'تأسیسات', 'نازک‌کاری'][i % 3], floor: String(i % 16 + 1)}); }
const people = ENG.concat(['آقای حیدرنیا', 'آقای خان احمدی', 'آقای سامین خواجه‌زاده']).map((n, i) => ({name: n, role: ['کنترل پروژه', 'امور قراردادی', 'مهندس اجرا', 'مدیریت پروژه', 'سرپرست کارگاه', 'مهندس اجرا'][i], level: i === 3 ? 2 : 3, avatar_url: '', must_change: false, active: true, pending: false}));
const prevDay = addDays(T0, -1);
const dayOf = d => ({rows: activities.filter(r => r.date_fa === d), prev_rows: activities.filter(r => r.date_fa === addDays(d, -1)), issues: issues.filter(r => r.date_fa === d), machines: []});
function json(route, body, status){ return route.fulfill({status: status || 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(body)}); }
async function install(page){
  await page.route(/supabase\.co\/(rest|storage|functions)\//, async route => {
    const req = route.request(), url = decodeURIComponent(req.url()), path = url.replace(/^.*\/rest\/v1\//, '');
    let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
    if(req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}});
    if(/^rpc\/(bundle3|day3|pm_file_urls|pm_file_url)/.test(path)) return json(route, {code: 'PGRST202', message: 'Could not find'}, 404);
    if(path.startsWith('rpc/bundle2') && process.env.FAIL) return json(route, {message:'x'}, 500);
    if(path.startsWith('rpc/bundle2') && process.env.DELAY) await new Promise(r=>setTimeout(r,+process.env.DELAY));
    if(path.startsWith('rpc/bundle2')){ const d = toEn(body.p_date || T0); return json(route, Object.assign({statements: st, contracts: ct, minutes: mn, letters: lt, tasks: tk, nudges: [], lists: [], people}, dayOf(d))); }
    if(path.startsWith('rpc/day_only')) return json(route, dayOf(toEn(body.p_date || T0)));
    if(path.startsWith('rpc/pm_whoami')) return json(route, {v: 1, name: process.env.WHO || 'آقای مهدی نعیمی', admin: !process.env.NONADMIN, locked: false});
    if(path.startsWith('rpc/session_epoch')) return json(route, {epoch: 0});
    if(path.startsWith('rpc/')) return json(route, {ok: false});
    if(req.method() !== 'GET') return json(route, []);
    if(path.startsWith('people')) return json(route, people);
    if(path.startsWith('designs')) return json(route, ds);
    if(path.startsWith('activities')){ const g = url.match(/date_fa=gte\.([\d/]+)/), l = url.match(/date_fa=lte\.([\d/]+)/), e = url.match(/date_fa=eq\.([\d/]+)/);
      let a = activities; if(e) a = a.filter(r => r.date_fa === e[1]); if(g) a = a.filter(r => r.date_fa >= g[1]); if(l) a = a.filter(r => r.date_fa <= l[1]);
      const c = url.match(/contractor=in\.\(([^)]*)\)/); if(c){ const S = c[1].split(',').map(x => x.replace(/"/g, '')); a = a.filter(r => S.indexOf(r.contractor) !== -1); }
      return json(route, a); }
    if(path.startsWith('issues')){ const g = url.match(/date_fa=gte\.([\d/]+)/), l = url.match(/date_fa=lte\.([\d/]+)/); let a = issues; if(g) a = a.filter(r => r.date_fa >= g[1]); if(l) a = a.filter(r => r.date_fa <= l[1]); return json(route, a); }
    if(path.startsWith('tasks')) return json(route, tk);
    return json(route, []);
  });
}
module.exports = {install, T0};
