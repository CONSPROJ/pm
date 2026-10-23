/* سرویس‌ورکر سامانهٔ پروژه — اعلان (Web Push) و بازشدن فوری صفحه.
   فقط خودِ صفحهٔ اصلی (index.html) نگه داشته می‌شود: بار بعد بی‌درنگ از حافظه باز می‌شود
   و هم‌زمان نسخهٔ تازه از شبکه گرفته و جایگزین می‌شود (برای بار بعد). وقتی نسخهٔ تازه‌ای
   منتشر شده، خود صفحه با «?v=…» دوباره باز می‌شود و آن درخواست همیشه از شبکه می‌آید.
   هیچ داده‌ای (درخواست‌های سرور، فایل‌ها) ذخیره نمی‌شود. */
const PAGE_CACHE = 'pm-page-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  const ks = await caches.keys();
  await Promise.all(ks.filter(k => k.startsWith('pm-page-') && k !== PAGE_CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

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
  const fromNet = async () => {
    const res = await fetch(req, {cache: 'no-cache'});
    if(res && res.ok && res.type === 'basic'){ const c = await caches.open(PAGE_CACHE); await c.put(key, res.clone()); }
    return res;
  };
  e.respondWith((async () => {
    /* نسخهٔ مشخص خواسته شده (به‌روزرسانی): از شبکه */
    if(url.searchParams.has('v')){ try{ return await fromNet(); }catch(err){ const hit = await caches.match(key); if(hit) return hit; throw err; } }
    const hit = await caches.match(key);
    if(hit){ e.waitUntil(fromNet().catch(() => {})); return hit; }
    return fromNet();
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
