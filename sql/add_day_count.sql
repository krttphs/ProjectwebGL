-- จำนวนวันของเกม (host เลือก 1 / 3 / 5 / 7) — ความยาว 1 วัน = morning_time + noon_time + evening_time
-- รันครั้งเดียวใน Supabase > SQL Editor
alter table public.game_rooms
  add column if not exists day_count integer not null default 1
  check (day_count in (1, 3, 5, 7));
