-- =====================================================================
-- 0003 — کاتالوگ اجازه‌ها و قوانین پیش‌فرض.
-- این‌ها «پیش‌فرض اولیه»اند؛ ادمین هر کدام را برای سطح، سمت، گروه، نوع طرف،
-- طرف یا فرد تغییر می‌دهد (جدول grants و settings). کد هیچ‌کدام را ثابت فرض نمی‌کند.
-- سطح‌ها: ۱ ادمین سامانه، ۲ مدیریت، ۳ کارشناس، ۴ ناظر/مشاور، ۵ سرپرست، ۶ بیرونی (معنای سطح هم در تنظیمات قابل تغییر است)
-- =====================================================================

insert into capabilities (key, module, title, description, default_levels, constraint_keys) values
  -- پروژه و افراد
  ('project.read',       'project',  'دیدن پروژه',                  null, '{1,2,3,4,5,6}', '{}'),
  ('project.manage',     'project',  'ویرایش اطلاعات پروژه',         'نام، کاربری، مرحله، مشخصات', '{1}', '{}'),
  ('people.read',        'people',   'دیدن افراد و طرف‌ها',          null, '{1,2,3,4,5}', '{}'),
  ('people.manage',      'people',   'افزودن و ویرایش افراد و عضویت‌ها', 'دعوت، سمت، سطح، غیرفعال کردن', '{1}', '{}'),
  ('parties.manage',     'people',   'تعریف طرف‌ها',                 'کارفرما، مشاور، تیم طراحی، پیمانکار، …', '{1,2}', '{}'),
  ('chart.manage',       'people',   'ویرایش چارت سازمانی',          'سمت‌ها و جایگاه افراد', '{1}', '{}'),
  ('groups.manage',      'people',   'تعریف گروه‌ها و اعضا',          null, '{1}', '{}'),
  -- دسترسی، تنظیمات، گزارش کار
  ('access.manage',      'admin',    'مدیریت دسترسی‌ها',              'اعطا و سلب هر اجازه به سطح، سمت، گروه، طرف یا فرد', '{1}', '{}'),
  ('settings.manage',    'admin',    'تغییر قوانین و تنظیمات',        null, '{1}', '{}'),
  ('audit.read',         'admin',    'دیدن گزارش کار کاربران',        null, '{1}', '{}'),
  -- کنترل مدارک
  ('doc.config',         'docs',     'تعریف رشته‌ها، انواع سند و گردش‌کار', null, '{1}', '{}'),
  ('doc.read',           'docs',     'دیدن مدارک',                   'با محدودیت نوع سند، رشته یا فقط مدارک طرف خود', '{1,2,3,4}', '{doc_types,disciplines,own_party}'),
  ('doc.create',         'docs',     'ثبت مدرک و ویرایش تازه',        null, '{1,2,3}', '{doc_types,disciplines,own_party}'),
  ('doc.edit',           'docs',     'اصلاح مشخصات مدرک',             null, '{1,2}', '{doc_types,disciplines}'),
  ('doc.delete',         'docs',     'حذف مدرک',                     null, '{1}', '{}'),
  ('doc.review',         'docs',     'بررسی و پاسخ (تغییر وضعیت)',    'گذارهای گردش‌کار می‌توانند اجازهٔ جدا بخواهند', '{1,2,4}', '{doc_types,disciplines}'),
  ('transmittal.read',   'docs',     'دیدن ارسال مدارک',              null, '{1,2,3,4}', '{own_party}'),
  ('transmittal.send',   'docs',     'ارسال مدارک (ترنسمیتال)',       null, '{1,2,3}', '{own_party}'),
  ('mdr.read',           'docs',     'دیدن MDR',                     null, '{1,2,3,4}', '{disciplines}'),
  ('mdr.manage',         'docs',     'برنامه‌ریزی MDR',               'تاریخ‌های برنامه و وزن مدارک', '{1,2}', '{disciplines}'),
  -- اسناد مدیریتی (همان بخش‌های فعلی سایت)
  ('contract.read',      'finance',  'دیدن قراردادها',                null, '{1,2}', '{}'),
  ('statement.read',     'finance',  'دیدن صورت وضعیت‌ها',            null, '{1,2}', '{}'),
  ('letter.read',        'docs',     'دیدن نامه‌ها',                  null, '{1,2,3}', '{}'),
  ('minute.read',        'docs',     'دیدن صورتجلسه‌ها',               null, '{1,2,3,5}', '{}')
on conflict (key) do nothing;

insert into setting_defs (key, module, title, description, value_type, default_value, options) values
  ('levels.names',      'people',  'نام سطح‌ها',                     'معنای هر سطح دسترسی', 'json', '{"1":"ادمین سامانه","2":"مدیریت","3":"کارشناس","4":"ناظر / مشاور","5":"سرپرست","6":"بیرونی"}', null),
  ('project.phases',    'project', 'مرحله‌های پروژه',                'فهرست مرحله‌ها و بخش‌های پیشنهادی هر مرحله', 'json',
      '[{"code":"design1","title":"طراحی فاز ۱"},{"code":"design2","title":"طراحی فاز ۲"},{"code":"build","title":"اجرا"},{"code":"finish","title":"نازک‌کاری و تأسیسات"},{"code":"handover","title":"تحویل و بهره‌برداری"}]', null),
  ('project.use_types', 'project', 'کاربری‌های پروژه',               null, 'json', '["مسکونی","تجاری","اداری","مختلط","هتل","درمانی","آموزشی","صنعتی","زیرساخت"]', null),
  ('report.deadline_hour','daily', 'ساعت مهلت گزارش روزانه',         null, 'number', '17', null),
  ('report.missing_back_days','daily','اعلان نقص گزارش تا چند روز قبل', null, 'number', '3', null),
  ('material.same_day', 'crew',    'انتقال مصالح فقط تا پایان همان روز', null, 'boolean', 'true', null),
  ('crew.lunch_from',   'crew',    'شروع ساعت ناهار',                null, 'number', '12', null),
  ('crew.lunch_hours',  'crew',    'مدت ناهار (ساعت)',               null, 'number', '1', null),
  ('doc.near_due_days', 'docs',    'هشدار نزدیک موعد (روز)',          null, 'number', '3', null),
  ('doc.resubmit_warn_days','docs','هشدار اصلاح و ارسال مجدد بیش از (روز)', 'زمان نزد طراح بین پاسخ و ارسال ویرایش بعد', 'number', '14', null),
  ('doc.resubmit_bad_days','docs', 'بحرانی اصلاح و ارسال مجدد بیش از (روز)', null, 'number', '30', null),
  ('doc.progress_weights','docs',  'پیشرفت MDR بر حسب وضعیت',        'سهم پیشرفت هر مرحله (درصد)', 'json', '{"none":0,"issued":40,"returned":55,"approved_conditional":80,"approved":100}', null),
  ('security.password_min','security','کمترین طول رمز',              null, 'number', '8', null),
  ('security.session_days','security','اعتبار نشست ورود (روز)',       null, 'number', '30', null),
  ('security.idle_logout_days','security','خروج خودکار پس از بی‌استفادگی (روز)', null, 'number', '60', null)
on conflict (key) do nothing;
