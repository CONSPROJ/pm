-- وراثت سمت و حالت «سمت‌محور» (همان رفتار سایت فعلی: ogDescOf، permInhFrom، permPosMode)
-- سمت مافوق هر اجازه‌ای را که سمت‌های زیرمجموعه‌اش (از راه parent_id) دارند، خودش هم دارد؛ مگر inherit = false.
alter table positions add column if not exists inherit boolean not null default true;

insert into setting_defs (key, module, title, description, value_type, default_value, options) values
  ('access.mode', 'people', 'منبع اصلی دسترسی',
   'level: سطح و سمت با هم؛ position: سمت‌محور (برای کسی که سمت دارد، اجازه‌ها فقط از سمت، زیرمجموعه و استثنای فردی؛ سطح فقط اجازه‌های پایه)',
   'enum', '"level"', '["level","position"]'),
  ('access.base_caps', 'people', 'اجازه‌های پایه از سطح',
   'در حالت سمت‌محور، این اجازه‌ها همچنان از سطح می‌آیند', 'json', '["project.read"]', null)
on conflict (key) do nothing;
