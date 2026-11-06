/* ====== نسخهٔ انگلیسی (English UI) ======
   لایهٔ ترجمهٔ رابط: متن‌ها، placeholder، title و aria-label را با واژه‌نامه ترجمه می‌کند (اول تطبیق کامل،
   بعد عبارت‌های شناخته‌شده داخل متن و قاعده‌های شمارشی)، اعداد فارسی را لاتین و صفحه را چپ‌به‌راست می‌کند.
   داده‌های واردشده (نام‌ها، شرح‌ها) همان‌طور که ثبت شده‌اند می‌مانند. روشن/خاموش: دکمهٔ EN/فا (localStorage siteLogM.lang). */
(function(){
  var LANG = 'fa'; try{ LANG = localStorage.getItem('siteLogM.lang') || 'fa'; }catch(e){}
  window.pmLang = LANG;
  window.pmSetLang = function(l){ try{ localStorage.setItem('siteLogM.lang', l); }catch(e){} location.reload(); };
  if(LANG !== 'en') return;
  var D = {
    /* ناوبری و سربرگ */
    'خانه':'Home','میز کار':'Workspace','اسناد':'Documents','گزارش‌ها':'Reports','ثبت تازه':'New entry','+ ثبت تازه':'+ New entry','ثبت تازه +':'New entry +','ثبت':'Save','سامانه پروژه':'Project System','سامانهٔ پروژه':'Project System',
    'برو به بخش…':'Go to section…','برو به بخش':'Go to section','پرکاربرد':'Frequent','میان‌برها':'Shortcuts','پیام‌ها':'Messages','اعلان‌ها':'Notifications','جست‌وجو':'Search','جست‌وجو در سامانه (Ctrl+K)':'Search (Ctrl+K)',
    'جست‌وجوی پیمانکار، سند، فایل…':'Search contractor, document, file…','کارت‌های فعالیت':'Activity cards','پروفایل من':'My profile','بخش‌های سامانه':'System sections','راهنمای سامانه':'Help','تنظیمات':'Settings','تنظیمات و پروفایل':'Settings & profile',
    'جمع/باز کردن ستون (Ctrl+B)':'Collapse sidebar (Ctrl+B)','جمع یا باز کردن ستون کناری':'Collapse sidebar','حالت نمایش':'Display mode','استودیو — میز کار گسترده با ستون کناری و چند ستون':'Studio — wide workspace with sidebar','کلاسیک — یک ستون فشرده، مثل گوشی':'Classic — single compact column',
    'انتخاب پروژه':'Select project','پروژه‌ها':'Projects','پروژه':'Project','مدیریت سامانه':'Administration','کاربران، دسترسی، داده و امنیت':'Users, access, data and security','خودکار (طبق تنظیم گوشی)':'Auto (device setting)','روز بخیر':'Good day','صبح بخیر':'Good morning','عصر بخیر':'Good afternoon','شب بخیر':'Good evening',
    'بستن':'Close','انصراف':'Cancel','ذخیره':'Save','حذف':'Delete','ویرایش':'Edit','دیدن':'View','مشاهده':'View','همه':'All','همهٔ':'All','باز':'Open','فیلتر':'Filter','خروجی':'Export','اکسل':'Excel','چاپ':'Print','چاپ / PDF':'Print / PDF','دانلود فایل':'Download file','بارگذاری فایل اصلاح‌شده':'Upload edited file','اشتراک‌گذاری':'Share','ابزارهای بیشتر':'More tools','بعدی':'Next','قبلی':'Previous','تأیید':'Approve','رد':'Reject','بازگشت':'Back','در حال دریافت…':'Loading…','در حال دریافت':'Loading','موردی نیست.':'Nothing here.','هنوز موردی ثبت نشده.':'Nothing recorded yet.','جست‌وجو…':'Search…',
    /* خانه */
    'کار باز من':'My open tasks','در کارتابل':'In my inbox','عقب از موعد':'Overdue','نیاز به اقدام':'Needs action','موعد این هفته':'Due this week','تا هفت روز آینده':'Next 7 days','منتظر تأیید من':'Awaiting my approval','چیزی منتظر نیست':'Nothing pending','همهٔ کارهای من':'All my tasks','نمای پروژه':'Project overview','معرفی پروژه':'Project profile',
    'فعالیت‌ها':'Activities','انجام‌شده':'Done','در حال انجام':'In progress','شروع‌نشده':'Not started','اسناد در جریان':'Documents in progress','بدون مورد بحرانی':'No critical items','مطالبات پیمانکاران':'Contractor receivables','تومان':'Toman','پرداخت‌شده':'Paid','مانده':'Outstanding','صورت وضعیت هر ماه':'Monthly payment certificates',
    'نیروی کارگاه · هفت روز':'Site workforce · 7 days','نفر در روز':'people/day','غایب دیروز':'Absent yesterday','بیشترین حضور':'Best attendance','ابلاغ فعالیت':'Assign task','یادآور':'Reminder','جریمه':'Penalty','بدهکاری‌ها و خروجی‌ها':'Debts & exports','گزارش هفتگی کارفرما':'Weekly client report','هشدار زودهنگام':'Early warnings',
    'پشتیبان‌گیری':'Backup','هنوز گرفته نشده':'Not taken yet','پشتیبان':'Backup','موعد امروز':'Due today','گزارش‌دهنده‌ها':'Reporters','گزارش‌های امروز':'Today’s reports','کار امروز':'Today','پیگیری‌ها':'Follow-ups','دفتر فنی':'Technical office','اجرایی':'Field','سند':'Doc','پرداخت شده':'Paid','نفرات':'Workforce','فوری':'urgent','کمتر':'Less','وضع هوای کارگاه':'Site weather','وضع هوا':'Weather',
    /* دسته‌ها و بخش‌های میز کار */
    'کارگاه':'Site','برنامه‌ریزی':'Planning','کیفیت و ایمنی':'Quality & Safety','فنی و مهندسی':'Engineering','تدارکات و انبار':'Procurement & Stores','مالی و قرارداد':'Finance & Contracts','منابع انسانی':'People','فضاها و تحویل':'Spaces & Handover','پیگیری و هماهنگی':'Follow-up & coordination','سایر بخش‌ها':'Other',
    'کارتابل تأیید':'Approvals','گزارش روزانه':'Daily report','حضور کارگران':'Labor attendance','تأخیرات و هوا':'Delays & weather','عکس‌های کارگاه':'Site photos','برنامهٔ زمان‌بندی':'Schedule','برنامهٔ سه‌هفته‌ای':'3-week look-ahead','پیش‌بینی پایان کار':'Completion forecast','ریسک‌ها':'Risks','جلسات':'Meetings',
    'کنترل کیفیت':'Quality control','بتن و آزمایش':'Concrete & tests','مجوز کار':'Work permit','ارسال مدارک':'Submittals','نقشه‌خوان':'Drawing viewer','برش ورق':'Cut optimizer','خرید':'Purchasing','ورود مصالح':'Material receiving','انبار':'Warehouse','مصرف مصالح':'Material usage','ماشین‌آلات':'Equipment','تعمیرات ماشین‌آلات':'Equipment maintenance',
    'متره و برآورد':'Quantities & estimate','دستور تغییر':'Change orders','بودجه':'Budget','نامه‌ها و مکاتبات':'Correspondence','ارزیابی پیمانکاران':'Contractor rating','همهٔ پروژه‌ها':'All projects','اشخاص':'People directory','چارت سازمانی':'Org chart','مرخصی':'Leave','فضاها و واحدها':'Spaces & units','تحویل واحد':'Unit handover',
    'بخش‌های میز کار':'Workspace sections','جست‌وجو در میز کار یا کل سامانه…':'Search workspace or whole system…','کاربران و دسترسی':'Users & access',
    /* اسناد */
    'اسناد و دفتر فنی':'Documents & technical office','صورت وضعیت':'Payment certificate','صورت وضعیت‌ها':'Payment certificates','قرارداد':'Contract','قراردادها':'Contracts','نامه':'Letter','صورتجلسه':'Minutes','سند طراحی':'Design document','اسناد طراحی':'Design documents','آرشیو':'Archive','فعالیت عمومی':'General activity',
    'فهرست':'List','فهرستی':'List','کارت':'Card','کارتی':'Cards','جدول':'Table','وضعیت ابلاغ':'Assignment status','تفکیک رسیدگی':'Review stage','مرتب‌سازی':'Sort','زمان ثبت در سامانه':'Created time','جدید به قدیم':'Newest first','عنوان / شماره':'Title / No.','طرف':'Party','وضعیت':'Status','مسئول':'Owner','تاریخ':'Date',
    'بررسی داخلی':'Internal review','بررسی کارفرما':'Client review','بررسی پیمانکار':'Contractor review','تایید شده':'Approved','تأیید شده':'Approved','تأیید نهایی':'Final approval','امانی':'Cost-plus','نحوهٔ نمایش':'View','گروه‌بندی':'Grouping','مرتب‌سازی بر اساس':'Sort by','ابلاغ درون‌سازمانی':'Internal','ابلاغ برون‌سازمانی':'External',
    'خروجی Excel / PDF':'Export Excel / PDF','ورود از اکسل':'Import from Excel','ثبت صورت وضعیت تازه':'New payment certificate','فیلتر دفتر فنی':'Filter','دسته‌های دفتر فنی':'Document categories',
    /* فعالیت‌ها */
    'انجام شده':'Done','در حال اجرا':'In progress','انجام نشده':'Not done','تقویم':'Calendar','برنامهٔ اجرا':'Execution plan','گانت':'Gantt','سه هفتهٔ آینده':'Next 3 weeks','نما':'View','پرسنل پروژه':'Project staff','کارفرما':'Client','پیمانکاران':'Contractors','طبقه':'Floor','زیر بار':'Overloaded','فعالیت':'Activity',
    'همهٔ وضعیت‌ها':'All statuses','فقط «در حال اجرا»':'Only “in progress”','فقط «انجام نشده»':'Only “not done”','فقط «انجام شده»':'Only “done”','بخش‌های لیست فعالیت':'Activity list sections','نمای لیست فعالیت':'Activity list view',
    /* گزارش‌ها */
    'روز':'Day','هفته':'Week','ماه':'Month','۳ ماه':'3 months','سال':'Year','روزانه':'Daily','هفتگی':'Weekly','ماهانه':'Monthly','سه‌ماهه':'Quarterly','سالانه':'Yearly','نمایش گزارش':'Show report','نوع گزارش':'Report type','تاریخ گزارش':'Report date','بازهٔ دلخواه':'Custom range',
    'مالی':'Finance','نیروی انسانی':'Workforce','نیروی کارگری':'Labor','تدارکاتی':'Procurement','کنترل پروژه':'Project control','بودجه و جریان نقدی':'Budget & cash flow','خلاصه گزارش':'Summary','گزارش جامع پروژه':'Full project report','جریان نقدی ماهانه':'Monthly cash flow','فعالیت‌های باز':'Open activities',
    'مرکز گزارش و خروجی':'Report center','ریسک پروژه':'Project risk','تأخیرات و وضع هوا':'Delays & weather','بودجه و هزینه':'Budget & cost','تعمیر و نگهداری':'Maintenance','ایمنی و بهداشت':'Health & safety','تدارکات':'Procurement','تغییرات و ادعا':'Changes & claims',
    /* ثبت تازه */
    'چه چیزی ثبت می‌کنید؟':'What do you want to record?','گزارش پیمانکاری':'Contractor report','گزارش کارگری':'Labor report','گزارش HSE':'HSE report','گزارش‌های ثبت‌شده':'Recorded reports','درخواست خرید':'Purchase request','پیگیری خریدها':'Track purchases','رسید کالا':'Goods receipt','حواله و امانت':'Issue & loan','درخواست بازرسی':'Inspection request',
    'بازرسی‌ها و NCR':'Inspections & NCR','تغییرات و ادعاها':'Changes & claims','تغییر کار یا ادعا':'Change or claim','کارکرد ماشین‌آلات':'Equipment log','اسناد دفتر فنی':'Technical documents','فعالیت اجرایی تازه':'New field activity','ثبت تأخیر یا وضع هوا':'Log delay or weather','درخواست بازرسی ITP':'ITP inspection request','RFI تازه':'New RFI',
    'ارسال مدرک فنی':'New submittal','سرویس یا تعمیر دستگاه':'Equipment service','ریسک تازه':'New risk','کد هزینه':'Cost code','ارزیابی پیمانکار':'Contractor evaluation','ایمنی (HSE)':'Safety (HSE)','گزارش روزانه ':'Daily report',
    /* دفترها */
    'منتظر پاسخ':'Awaiting answer','پاسخ داده شد':'Answered','بسته شد':'Closed','ارسال شده':'Submitted','برنامه‌ریزی شده':'Planned','قبول':'Pass','فعال':'Active','در حال کاهش':'Mitigating','رخ داد':'Occurred','ثبت شده':'Recorded','درخواست تمدید':'Extension requested','تمدید پذیرفته':'Extension accepted','تمدید رد شد':'Extension rejected','انجام شد':'Done','از کار افتاده':'Down','منتظر تعمیر':'Awaiting repair','ثبت شد':'Recorded',
    'درخواست شده':'Requested','تأیید شده (فعال)':'Approved (active)','رد شده':'Rejected','بسته شده':'Closed','رسیده':'Arrived','پذیرفته':'Accepted','پذیرش مشروط':'Conditional','مرجوع':'Returned','ثبت در انبار':'Stored','در حال تکمیل':'In progress','تحویل شد':'Handed over','همهٔ طبقات':'All floors','انتخاب…':'Select…',
    'کار امروز':'Today','کارتابل من':'My inbox','پرکاربردهای من':'My frequent','فعالیت اجرایی':'field activity','فعالیت اجرایی در جریان':'field activities in progress','نزدیک به بحرانی شدن':'near critical','از ارسال':'since sent',
    'جست‌وجوی پیمانکار، سند، فایل…':'Search contractor, document, file…','جست‌وجوی پیمانکار، سند، فایل...':'Search contractor, document, file…','صاف':'Clear','کمی ابری':'Partly cloudy','ابری':'Cloudy','مه':'Fog','نم‌نم باران':'Drizzle','باران':'Rain','برف':'Snow','رعد و برق':'Thunderstorm',
    'همهٔ کارها':'All tasks','گزارش‌دهندگان':'Reporters','نفرستاده':'not sent','پیش‌نمایش':'Preview','گزارش ساخته نشد':'Report failed','اطلاعات ناقص':'Missing information','ثبت نشد':'Not saved','هنوز نمی‌شود':'Not yet possible',
    'سؤال فنی از مشاور یا طراح':'Technical question to consultant or designer','موضوع':'Subject','رشته':'Discipline','مهلت پاسخ':'Response deadline','شرح سؤال':'Question','پاسخ':'Answer','شرح':'Description','توضیح':'Notes','عکس':'Photo','مقدار':'Quantity','واحد':'Unit','تأمین‌کننده':'Supplier','پیمانکار':'Contractor','مسئول پیگیری':'Owner','دسته':'Category','احتمال':'Likelihood','اثر':'Impact',
    'انجام':'done','اجرا':'Execution','کیفیت':'Quality','ابلاغ':'Assignment','تقویم موعدها':'Deadline calendar','موعدها':'deadlines','یادآورها':'reminders','پیام':'Messages','جریمه‌ها':'Penalties','یادآور':'Reminder','جناب':'','سرکار':'','شنبه':'Sat','یکشنبه':'Sun','دوشنبه':'Mon','سه‌شنبه':'Tue','چهارشنبه':'Wed','پنجشنبه':'Thu','جمعه':'Fri','امروز':'Today','فردا':'Tomorrow','دیروز':'Yesterday'
  };
  var MON = {'فروردین':'Farvardin','اردیبهشت':'Ordibehesht','خرداد':'Khordad','تیر':'Tir','مرداد':'Mordad','شهریور':'Shahrivar','مهر':'Mehr','آبان':'Aban','آذر':'Azar','دی':'Dey','بهمن':'Bahman','اسفند':'Esfand'};
  Object.keys(MON).forEach(function(k){ D[k] = MON[k]; });
  /* عبارت‌های داخل متن (بلندتر اول) */
  var KEYS = Object.keys(D).filter(function(k){ return k.length >= 4 && D[k] && /[؀-ۿ]/.test(k); }).sort(function(a, b){ return b.length - a.length; });
  var esc = function(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  var BIG = new RegExp('(^|[\\s،,·:«»()\\[\\]/|\\-–—])(' + KEYS.map(esc).join('|') + ')(?=$|[\\s،,·:«»()\\[\\]/|\\-–—؟!.])', 'g');
  var R = [
    [/\+ ?([\d۰-۹]+) میان‌بر دیگر/g, '+ $1 more shortcuts'], [/([\d۰-۹]+) روز از ارسال/g, '$1 days since sent'], [/([\d۰-۹]+) روز از ([\d۰-۹]+)/g, '$1 of $2 days'], [/٪ از /g, '% of '], [/([\d۰-۹]+) فعالیت اجرایی در جریان/g, '$1 field activities in progress'],
    [/([\d۰-۹]+) نفر نفرستاده/g, '$1 not sent'], [/و ([\d۰-۹]+) بخش دیگر/g, 'and $1 more'], [/و ([\d۰-۹]+) نفر دیگر/g, 'and $1 others'], [/([\d۰-۹]+) بخش/g, '$1 sections'], [/([\d۰-۹]+) مورد/g, '$1 items'], [/([\d۰-۹]+) دیرکرد/g, '$1 late'], [/([\d۰-۹]+) انجام/g, '$1 done'],
    [/([\d۰-۹]+) در جریان/g, '$1 in progress'], [/([\d۰-۹]+) باز\b/g, '$1 open'], [/([\d۰-۹]+) نفر/g, '$1 people'], [/([\d۰-۹]+) روز/g, '$1 days'], [/([\d۰-۹]+) منتظر/g, '$1 pending'], [/([\d۰-۹]+) فعالیت/g, '$1 activities'],
    [/([\d۰-۹]+) بحرانی/g, '$1 critical'], [/([\d۰-۹]+) نزدیک موعد/g, '$1 due soon'], [/([\d۰-۹]+) پروژه/g, '$1 projects'], [/([\d۰-۹.]+) میلیارد/g, '$1 B'], [/([\d۰-۹.,]+) میلیون/g, '$1 M'], [/([\d۰-۹]+) از ([\d۰-۹]+)/g, '$1 of $2'],
    [/^همه \((.+)\)$/, 'All ($1)'], [/ تا /g, ' to '], [/٪/g, '%']
  ];
  var FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩';
  var digits = function(s){ return s.replace(/[۰-۹]/g, function(d){ return FA.indexOf(d); }).replace(/[٠-٩]/g, function(d){ return AR.indexOf(d); }); };
  var cache = new Map();
  function tr(s){
    if(!s || !/[؀-ۿ۰-۹]/.test(s)) return s;
    var c = cache.get(s); if(c !== undefined) return c;
    var t = s.trim(), lead = s.slice(0, s.indexOf(t)), tail = s.slice(s.indexOf(t) + t.length), out;
    if(D[t] != null) out = D[t];
    else { out = t; R.forEach(function(r){ out = out.replace(r[0], r[1]); }); out = out.replace(BIG, function(m, p, k){ return p + D[k]; }).replace(BIG, function(m, p, k){ return p + D[k]; }); out = out.replace(/ و /g, ' and ').replace(/، ?/g, ', ').replace(/  +/g, ' ').trim(); }
    out = lead + digits(out) + tail;
    if(cache.size > 20000) cache.clear(); cache.set(s, out); return out;
  }
  window.pmTr = tr;
  var ATTR = ['placeholder', 'title', 'aria-label'];
  function walk(root){
    if(!root) return;
    if(root.nodeType === 3){ var v = root.nodeValue; var n = tr(v); if(n !== v) root.nodeValue = n; return; }
    if(root.nodeType !== 1) return;
    var tg = root.tagName; if(tg === 'SCRIPT' || tg === 'STYLE' || tg === 'TEXTAREA') return;
    if(root.isContentEditable) return;
    for(var i = 0; i < ATTR.length; i++){ var a = root.getAttribute(ATTR[i]); if(a){ var b = tr(a); if(b !== a) root.setAttribute(ATTR[i], b); } }
    if(tg === 'INPUT') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {acceptNode: function(n){ if(n.nodeType === 1){ var t = n.tagName; return (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || n.isContentEditable) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } return NodeFilter.FILTER_ACCEPT; }});
    var x; while((x = w.nextNode())){
      if(x.nodeType === 3){ var v2 = x.nodeValue; if(v2 && v2.trim() === 'ثبت' && x.parentElement && x.parentElement.closest('#tabWrite')){ x.nodeValue = v2.replace('ثبت', 'New'); continue; } if(v2 && v2.length < 400){ var n2 = tr(v2); if(n2 !== v2) x.nodeValue = n2; } }
      else { for(var j = 0; j < ATTR.length; j++){ var a2 = x.getAttribute(ATTR[j]); if(a2){ var b2 = tr(a2); if(b2 !== a2) x.setAttribute(ATTR[j], b2); } } }
    }
  }
  var Q = new Set(), raf = 0;
  function flush(){ raf = 0; var L = Array.from(Q); Q.clear(); obs.disconnect(); L.forEach(function(n){ if(n.isConnected !== false) walk(n); }); start(); }
  var obs = new MutationObserver(function(M){ for(var i = 0; i < M.length; i++){ var m = M[i];
      if(m.type === 'characterData') Q.add(m.target);
      else if(m.type === 'attributes') Q.add(m.target);
      else for(var k = 0; k < m.addedNodes.length; k++) Q.add(m.addedNodes[k]); }
    if(!raf) raf = requestAnimationFrame(flush); });
  function start(){ obs.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTR}); }
  var de = document.documentElement; de.lang = 'en'; de.dir = 'ltr'; de.classList.add('lang-en');
  var t0 = document.title; document.title = tr(t0);
  var go = function(){ var lb = document.querySelector('#langBtn .lang-t'); if(lb) lb.textContent = 'فا'; walk(document.body); start(); };
  if(document.body) go(); else document.addEventListener('DOMContentLoaded', go);
})();
