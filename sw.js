/* سرویس‌ورکر سامانهٔ پروژه — فقط برای اعلان (Web Push).
   هیچ درخواستی را رهگیری یا ذخیره نمی‌کند؛ نسخهٔ سایت همیشه از شبکه می‌آید. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
