-- קליטת הזמנות ממספר וואטסאפ עסקי (WhatsApp Cloud API).
-- הפונקציה supabase/functions/whatsapp מקבלת את ההודעות מ-Meta, שומרת אותן בכרטיס
-- ונותנת ל-AI למלא את פרטי ההזמנה. כל הכתיבה כאן נעשית רק עם המפתח הסודי (service_role).

-- app: נפתחה באפליקציה, whatsapp: נפתחה מהודעה של לקוח
alter table public.orders add column source text not null default 'app';
-- מספר הוואטסאפ של הלקוח כפי ש-Meta שולחת אותו (972...)
alter table public.orders add column wa_phone text;
-- סיכום ה-AI של מה שהלקוח ביקש
alter table public.orders add column ai_summary text not null default '';
-- הערכים האחרונים שה-AI מילא. שדה שהמנהל שינה ידנית לא נדרס.
alter table public.orders add column ai_fields jsonb not null default '{}';

create index on public.orders (wa_phone) where wa_phone is not null;

-- כל הודעה נכנסת נרשמת פעם אחת (Meta שולחת שוב אם לא קיבלה תשובה מהר).
create table public.wa_inbox (
  wa_message_id text primary key,
  phone text not null,
  order_id bigint references public.orders (id) on delete cascade,
  received_at timestamptz not null default now()
);

create index on public.wa_inbox (order_id, received_at);

alter table public.wa_inbox enable row level security;
-- אין מדיניות: רק הפונקציה בצד השרת ניגשת.
revoke all on public.wa_inbox from anon, authenticated;
grant all on public.wa_inbox to service_role;

-- מוצא הזמנה פתוחה של אותו לקוח מהשבועיים האחרונים, או פותח חדשה.
-- נעילה לפי מספר כדי שכמה תמונות שמגיעות יחד לא יפתחו כמה הזמנות.
create or replace function public.wa_order_for(p_phone text, p_name text, out order_id bigint, out created boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_local text := case when p_phone like '972%' then '0' || substr(p_phone, 4) else '+' || p_phone end;
  v_name text := coalesce(trim(p_name), '');
begin
  perform pg_advisory_xact_lock(hashtext('wa:' || p_phone));
  select o.id into order_id
  from public.orders o
  where o.wa_phone = p_phone
    and o.status <> 'done'
    and o.updated_at > now() - interval '14 days'
  order by o.created_at desc
  limit 1;
  created := order_id is null;
  if created then
    insert into public.orders (title, client_name, client_phone, source, wa_phone, ai_fields)
    values ('הודעה מוואטסאפ', v_name, v_local, 'whatsapp', p_phone,
            jsonb_build_object('title', 'הודעה מוואטסאפ', 'client_name', v_name))
    returning id into order_id;
    insert into public.messages (order_id, kind, body)
    values (order_id, 'system', 'נפתחה מהודעת וואטסאפ');
  end if;
end;
$$;

revoke execute on function public.wa_order_for(text, text) from public, anon, authenticated;
grant execute on function public.wa_order_for(text, text) to service_role;
