-- نحوهٔ انتقال بار در فرم انتقال مصالح (تاور / آسانسور / نفر)
-- یک بار در Supabase اجرا شود: SQL Editor ← New query ← این متن ← Run
-- تا این اجرا نشود، سایت مقدار را داخل «توضیحات» نگه می‌دارد و درست نمایش می‌دهد.
alter table material_move add column if not exists method text;
