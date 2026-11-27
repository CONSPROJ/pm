/* سرویس‌ورکر سامانهٔ پروژه — اعلان (Web Push) و بازشدن فوری صفحه.
   فقط خودِ صفحهٔ اصلی (index.html) نگه داشته می‌شود: بار بعد بی‌درنگ از حافظه باز می‌شود
   و هم‌زمان نسخهٔ تازه از شبکه گرفته و جایگزین می‌شود (برای بار بعد). وقتی نسخهٔ تازه‌ای
   منتشر شده، خود صفحه با «?v=…» دوباره باز می‌شود و آن درخواست همیشه از شبکه می‌آید.
   هیچ داده‌ای (درخواست‌های سرور، فایل‌ها) ذخیره نمی‌شود. */
const PAGE_CACHE = 'pm-page-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.filter(k => (k.startsWith('pm-page-') && k !== PAGE_CACHE) || (k.startsWith('pm-static-') && k !== STATIC_CACHE)).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

/* فایل‌های ثابت: کتابخانه‌ها، آیکون‌ها و قلم‌ها.
   نسخه‌دار (مثل xlsx-0.18.5) و قلم‌ها: اول از حافظه. بی‌نسخه (cad-*.js): از حافظه و هم‌زمان تازه‌سازی برای بار بعد. */
const STATIC_CACHE = 'pm-static-v2';
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;
  let u; try{ u = new URL(req.url); }catch(err){ return; }
  const font = u.hostname === 'fonts.gstatic.com' || u.hostname === 'fonts.googleapis.com';
  const own = u.origin === self.location.origin && /\/(lib|icons)\//.test(u.pathname);
  if(!font && !own) return;
  const versioned = font || /[-.]\d+\.\d+(\.\d+)?[.-]/.test(u.pathname) || /\.(png|svg|ico|woff2?)$/.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(STATIC_CACHE);
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if(res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {}); return res; });
    /* اسکریپت‌های بی‌نسخهٔ نقشه‌خوان (cad-*.js، libredwg-web.js): اول شبکه تا اصلاحیه‌ها همان بار اول برسند؛ قطع بودن = نسخهٔ نگه‌داشته */
    if(hit && !versioned && /\.m?js$/.test(u.pathname)){ try{ const r = await net; if(r && r.ok) return r; }catch(err){} return hit; }
    if(hit){ if(!versioned) e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if(!url.pathname.startsWith(scope.pathname)) return;
  const rest = url.pathname.slice(scope.pathname.length);
  if(rest && rest !== 'index.html') return;
  const key = new Request(scope.href);
  /* ۶۹۱: شمارهٔ ساخت نسخهٔ نگه‌داشته کنار خودش؛ با build.txt (چند بایت) مقایسه می‌شود */
  const bkey = new Request(scope.href + '__pm_build');
  const buildNow = async ms => { try{ const r = await Promise.race([fetch(scope.href + 'build.txt?t=' + Date.now(), {cache: 'no-store'}), new Promise(z => setTimeout(() => z(null), ms))]); return r && r.ok ? String(await r.text()).trim() : null; }catch(err){ return null; } };
  const fromNet = async () => {
    const res = await fetch(req, {cache: 'no-cache'});
    if(res && res.ok && res.type === 'basic'){ const c = await caches.open(PAGE_CACHE); await c.put(key, res.clone());
      try{ const txt = await res.clone().text(); const m = /<meta name="pm-build" content="(\d+)"/.exec(txt.slice(0, 120000)); if(m) await c.put(bkey, new Response(m[1])); }catch(err){} }
    return res;
  };
  e.respondWith((async () => {
    /* نسخهٔ مشخص خواسته شده (به‌روزرسانی): از شبکه */
    if(url.searchParams.has('v')){ try{ return await fromNet(); }catch(err){ const hit = await caches.match(key); if(hit) return hit; throw err; } }
    const hit = await caches.match(key);
    if(!hit) return fromNet();
    /* نسخهٔ نگه‌داشته همان آخرین نسخه است؟ فوری باز می‌شود (بی دانلود ۷ مگابایت). نسخهٔ تازه منتشر شده؟ همان نسخهٔ تازه یک بار از شبکه
       (پیش‌تر اگر شبکه بیش از ۳ ثانیه طول می‌کشید نسخهٔ قدیم نشان داده می‌شد و بعد صفحه خودش دوباره بار می‌شد). */
    const have = await (async () => { try{ const r = await caches.match(bkey); return r ? String(await r.text()).trim() : null; }catch(err){ return null; } })();
    const latest = await buildNow(2500);
    if(latest && have && latest === have){ e.waitUntil(Promise.resolve()); return hit; }
    if(latest){ try{ const res = await fromNet(); if(res && res.ok) return res; }catch(err){} return hit; }
    /* بی‌شبکه یا خیلی کند: مثل قبل — شبکه تا ۳ ثانیه، وگرنه نسخهٔ نگه‌داشته */
    const net = fromNet();
    e.waitUntil(net.then(() => {}, () => {}));
    const timer = new Promise(r => setTimeout(() => r(null), 3000));
    try{ const res = await Promise.race([net, timer]); if(res && res.ok) return res; }catch(err){}
    return hit;
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {body: e.data ? e.data.text() : ''}; }
  const title = d.title || 'سامانه پروژه';
  e.waitUntil((async () => {
    /* هر push باید اعلان نشان دهد (شرط مرورگرها، به‌ویژه آیفون)؛ صفحهٔ باز هم خبر می‌گیرد تا زنگوله تازه شود */
    const L = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    L.forEach(c => c.postMessage({pmPush: 1}));
    await self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      dir: 'rtl',
      lang: 'fa',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: {url: d.url || './', open: d.open || ''}
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const L = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for(const c of L){
      if('focus' in c){ await c.focus(); c.postMessage({pmPushOpen: 1, open: data.open || ''}); return; }
    }
    await self.clients.openWindow(new URL((data.url || './') + (data.open ? '#pm-open=' + encodeURIComponent(data.open) : ''), self.registration.scope).href);
  })());
});
