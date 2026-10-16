// تابع push سامانهٔ پروژه (Supabase Edge Function)
//
// GET            → کلید عمومی VAPID (محرمانه نیست؛ مرورگر برای اشتراک لازم دارد)
// POST {action:'test'} + سرآیند x-pm-token → یک اعلان آزمایشی برای همان کاربر
// POST از Database Webhook (جدول nudges، رویداد INSERT) → اعلان به گیرندهٔ ردیف
//
// Secrets لازم (Edge Functions ← Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (مثلاً mailto:you@company.ir)
//   اختیاری: PUSH_HOOK_SECRET (اگر در Webhook سرآیند x-hook-secret گذاشتید)
//
// امنیت:
//   - محتوای ردیف از خود Webhook پذیرفته نمی‌شود؛ ردیف با شناسه‌اش دوباره از
//     پایگاه‌داده خوانده می‌شود و فقط اگر کمتر از ۱۰ دقیقه پیش ساخته شده باشد.
//   - متن پیام خصوصی هرگز در اعلان نمی‌آید؛ فقط «پیام تازه از …».
//   - جدول push_subs فقط با کلید service_role (همین تابع) خوانده می‌شود.

import webpush from "npm:web-push@3.6.7";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const SUBJ = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const HOOK = Deno.env.get("PUSH_HOOK_SECRET") ?? "";
if (PUB && PRIV) webpush.setVapidDetails(SUBJ, PUB, PRIV);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-pm-token, x-hook-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

const nk = (s: unknown) =>
  String(s ?? "").replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[\s‌]+/g, " ").trim();
const cut = (s: unknown, n: number) => { const t = nk(s); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

// ردیف‌های داده یا رویدادهایی که اعلان جداگانه نمی‌خواهند
const SILENT = new Set([
  "کامنت", "واکنش", "یادآور", "مانع", "مانع-رخداد", "پیشرفت", "تغییر کارگری", "آپلود", "درخواست خرید",
  "برنامه زمانبندی", "منابع برنامه", "دوره همکاری", "کالای انبار", "گردش انبار", "درخواست انبار",
  "درخواست بازرسی", "عدم انطباق", "چک‌لیست کیفیت", "کاور پروفایل", "تغییر و ادعا", "ماشین‌آلات",
  "کارکرد ماشین", "بودجه پروژه", "عکس پیشرفت", "پشتیبان سامانه", "تدارکات", "انبار", "کنترل کیفیت", "تغییرات",
]);

type Sub = { endpoint: string; name: string; sub: webpush.PushSubscription };

async function sendTo(name: string, payload: Record<string, unknown>) {
  const r = await db("push_subs?select=endpoint,name,sub&limit=1000");
  if (!r.ok) return 0;
  const all = (await r.json()) as Sub[];
  const L = all.filter((x) => nk(x.name) === nk(name));
  let n = 0;
  await Promise.all(L.map(async (x) => {
    try {
      await webpush.sendNotification(x.sub, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db(`push_subs?endpoint=eq.${encodeURIComponent(x.endpoint)}`, { method: "DELETE" });
      }
    }
  }));
  return n;
}

function payloadOf(r: Record<string, unknown>) {
  const kind = nk(r.kind), from = nk(r.from_name), title = cut(r.title, 90);
  if (kind === "پیام") {
    return { title: from ? `پیام تازه از ${from}` : "پیام تازه", body: "برای خواندن، سامانه را باز کنید", tag: `msg:${from}`, open: `msg:${from}` };
  }
  if (kind === "missing") return { title: "یادآوری گزارش روزانه", body: title, tag: "missing" };
  if (kind === "نام‌بردن") return { title: `${from} از شما نام برد`, body: title, tag: `mn:${r.id}` };
  return { title: from ? `اعلان از ${from}` : "اعلان تازه", body: title || kind, tag: `n:${r.id}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!PUB || !PRIV) return json({ error: "VAPID keys are not set" }, 503);
  if (req.method === "GET") return json({ key: PUB });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  // اعلان آزمایشی برای خود کاربر (با نشست معتبر سایت)
  if (body.action === "test") {
    const tok = req.headers.get("x-pm-token") ?? "";
    if (tok.length < 32) return json({ error: "auth" }, 401);
    const w = await db("rpc/pm_whoami", { method: "POST", body: "{}", headers: { "x-pm-token": tok } });
    const me = w.ok ? ((await w.json()) as { name?: string }).name : "";
    if (!me) return json({ error: "auth" }, 401);
    const n = await sendTo(me, { title: "اعلان فعال است", body: "از این به بعد پیام‌ها و تلنگرها اینجا می‌آیند.", tag: "test" });
    return json({ ok: true, n });
  }

  // Webhook پایگاه‌داده: فقط با کلید service_role یا رمز Webhook
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const okHook = (SRK && auth === SRK) || (HOOK && req.headers.get("x-hook-secret") === HOOK);
  if (!okHook) return json({ error: "forbidden" }, 403);

  const rec = (body.record ?? {}) as Record<string, unknown>;
  if (body.table !== "nudges" || body.type !== "INSERT" || rec.id == null) return json({ skip: "type" });

  // ردیف واقعی از پایگاه‌داده (نه محتوای فرستاده‌شده)
  const q = await db(`nudges?id=eq.${encodeURIComponent(String(rec.id))}&select=id,created_at,from_name,to_name,kind,title,seen&limit=1`);
  const row = q.ok ? ((await q.json()) as Record<string, unknown>[])[0] : null;
  if (!row) return json({ skip: "missing" });
  if (Date.now() - new Date(String(row.created_at)).getTime() > 10 * 60 * 1000) return json({ skip: "old" });
  if (row.seen === true) return json({ skip: "seen" });
  if (SILENT.has(nk(row.kind))) return json({ skip: "silent" });
  const to = nk(row.to_name);
  if (!to || to === nk(row.from_name)) return json({ skip: "self" });

  const n = await sendTo(to, payloadOf(row));
  return json({ ok: true, n });
});
