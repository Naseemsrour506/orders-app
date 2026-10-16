-- מצב "העברה מהמנהל": הלקוחות כותבים למנהל, והמנהל מעביר (Forward) למספר העסקי רק את מה שהוא הזמנה.
-- כל רצף העברות מהמנהל הוא הזמנה אחת. איש קשר של לקוח שהמנהל מעביר ממלא את השם והטלפון.

-- המספר של מי שהעביר את ההודעות (972...), כשההזמנה נפתחה מהעברה
alter table public.orders add column wa_forwarded_by text;
create index on public.orders (wa_forwarded_by) where wa_forwarded_by is not null;

-- p_contact_phone: מספר הלקוח (972...) אם ההודעה היא איש קשר. אחרת ריק.
create or replace function public.wa_forward_order_for(
  p_manager text, p_contact_phone text, p_contact_name text, p_gap_minutes int,
  out order_id bigint, out created boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_current bigint;
  v_has_contact boolean;
  v_name text := coalesce(trim(p_contact_name), '');
  v_phone text := coalesce(p_contact_phone, '');
  v_local text := case when v_phone like '972%' then '0' || substr(v_phone, 4) when v_phone = '' then '' else '+' || v_phone end;
begin
  perform pg_advisory_xact_lock(hashtext('wa-fwd:' || p_manager));
  created := false;

  -- הרצף הנוכחי: הזמנה חדשה של אותו מנהל שקיבלה הודעה בדקות האחרונות
  select o.id, o.wa_phone is not null into v_current, v_has_contact
  from public.orders o
  where o.wa_forwarded_by = p_manager and o.status = 'new'
    and exists (select 1 from public.wa_inbox i where i.order_id = o.id
                and i.received_at > now() - make_interval(mins => p_gap_minutes))
  order by o.created_at desc limit 1;

  if v_phone <> '' then
    if v_current is not null and not v_has_contact then
      -- איש הקשר של ההזמנה שכבר התחילה
      update public.orders set wa_phone = v_phone, client_phone = v_local,
        client_name = case when client_name = '' then v_name else client_name end,
        ai_fields = ai_fields || jsonb_build_object('client_name', v_name)
      where id = v_current;
      order_id := v_current;
      return;
    end if;
    -- לקוח שכבר יש לו הזמנה פתוחה: ממשיכים אותה
    select o.id into order_id from public.orders o
    where o.wa_phone = v_phone and o.status <> 'done' and o.updated_at > now() - interval '14 days'
    order by o.created_at desc limit 1;
    if order_id is not null then
      update public.orders set wa_forwarded_by = p_manager where id = order_id;
      return;
    end if;
  elsif v_current is not null then
    order_id := v_current;
    return;
  end if;

  insert into public.orders (title, client_name, client_phone, source, wa_phone, wa_forwarded_by, ai_fields)
  values ('הודעה מוואטסאפ', v_name, v_local, 'whatsapp', nullif(v_phone, ''), p_manager,
          jsonb_build_object('title', 'הודעה מוואטסאפ', 'client_name', v_name))
  returning id into order_id;
  insert into public.messages (order_id, kind, body) values (order_id, 'system', 'נפתחה מהודעות שהמנהל העביר בוואטסאפ');
  created := true;
end;
$$;

revoke execute on function public.wa_forward_order_for(text, text, text, int) from public, anon, authenticated;
grant execute on function public.wa_forward_order_for(text, text, text, int) to service_role;
