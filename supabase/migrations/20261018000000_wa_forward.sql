-- מצב "העברה מהמנהל": הלקוחות כותבים למנהל, והמנהל מעביר (Forward) למספר העסקי רק את מה שהוא הזמנה.
-- כל רצף העברות מהמנהל הוא הזמנה אחת. איש קשר של לקוח שהמנהל מעביר ממלא את השם והטלפון.

-- המספר של מי שהעביר את ההודעות (972...), כשההזמנה נפתחה מהעברה
alter table public.orders add column wa_forwarded_by text;
create index on public.orders (wa_forwarded_by) where wa_forwarded_by is not null;

-- p_contact_phone: מספר הלקוח (972...) אם ההודעה היא איש קשר. אחרת ריק.
-- p_target: המנהל כתב מספר הזמנה ("#1003"): ההודעות הבאות נכנסות אליה.
-- p_new: המנהל כתב "חדש": נפתחת הזמנה חדשה וההודעות הבאות נכנסות אליה.
-- ההזמנה "הנוכחית" של המנהל היא זו שקיבלה ממנו את ההודעה האחרונה, אם זה היה בדקות האחרונות.
create or replace function public.wa_forward_pick(
  p_manager text, p_contact_phone text, p_contact_name text, p_gap_minutes int,
  p_target bigint, p_new boolean,
  out order_id bigint, out created boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_current bigint;
  v_has_contact boolean;
  v_name text := coalesce(trim(p_contact_name), '');
  v_phone text := coalesce(p_contact_phone, '');
  v_local text := case when v_phone like '972%' then '0' || substr(v_phone, 4) when v_phone = '' then '' else '+' || v_phone end;
begin
  created := false;

  if p_target is not null then
    select o.id into order_id from public.orders o where o.id = p_target and o.status <> 'done';
    return; -- ריק אם אין הזמנה פתוחה כזו
  end if;

  if not p_new then
    select o.id, o.wa_phone is not null into v_current, v_has_contact
    from public.wa_inbox i join public.orders o on o.id = i.order_id
    where i.phone = p_manager and o.status <> 'done'
      and i.received_at > now() - make_interval(mins => p_gap_minutes)
    order by i.received_at desc limit 1;

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
  end if;

  insert into public.orders (title, client_name, client_phone, source, wa_phone, wa_forwarded_by, ai_fields)
  values ('הודעה מוואטסאפ', v_name, v_local, 'whatsapp', nullif(v_phone, ''), p_manager,
          jsonb_build_object('title', 'הודעה מוואטסאפ', 'client_name', v_name))
  returning id into order_id;
  insert into public.messages (order_id, kind, body) values (order_id, 'system', 'נפתחה מהודעות שהמנהל העביר בוואטסאפ');
  created := true;
end;
$$;

-- נועלים לפי מנהל ורושמים את ההודעה בהזמנה באותה פעולה, כדי שכמה תמונות שמגיעות יחד ייכנסו לאותה הזמנה.
create or replace function public.wa_forward_order_for(
  p_manager text, p_message_id text, p_contact_phone text, p_contact_name text, p_gap_minutes int,
  p_target bigint default null, p_new boolean default false,
  out order_id bigint, out created boolean)
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('wa-fwd:' || p_manager));
  select p.order_id, p.created into order_id, created
  from public.wa_forward_pick(p_manager, p_contact_phone, p_contact_name, p_gap_minutes, p_target, p_new) p;
  if order_id is not null then
    update public.wa_inbox set order_id = wa_forward_order_for.order_id where wa_message_id = p_message_id;
  end if;
end;
$$;

revoke execute on function public.wa_forward_pick(text, text, text, int, bigint, boolean) from public, anon, authenticated;
revoke execute on function public.wa_forward_order_for(text, text, text, text, int, bigint, boolean) from public, anon, authenticated;
grant execute on function public.wa_forward_order_for(text, text, text, text, int, bigint, boolean) to service_role;
