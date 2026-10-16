-- הגרפיקאי רואה את כל ההזמנות, גם חדשות שהגיעו מוואטסאפ ועוד לא נשלחו אליו,
-- ויכול לאשר הזמנה חדשה ולהתחיל לעצב בעצמו (start_design).
-- אין לגרפיקאי עדכון ישיר לטבלת orders: שינוי הסטטוס עובר רק דרך הפונקציה.

-- משמש גם להודעות ולקבצים בכרטיס, כך שהגרפיקאי רואה את מה שהלקוח שלח
create or replace function public.designer_can_see(p_order_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_designer() and exists (select 1 from public.orders o where o.id = p_order_id)
$$;

drop policy orders_designer_read on public.orders;
create policy orders_designer_read on public.orders for select to authenticated
  using (public.is_designer());

-- הזמנה חדשה עוברת לעיצוב. הגרפיקאי מאשר שיש מספיק פרטים ומתחיל, או המנהל שולח אליו.
create or replace function public.start_design(p_order_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status public.order_status;
  v_role public.member_role := public.current_role_name();
begin
  if v_role is null or v_role not in ('designer', 'manager') then
    raise exception 'רק הגרפיקאי או המנהל יכולים לעשות את זה' using errcode = '42501';
  end if;
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then
    raise exception 'הזמנה לא נמצאה';
  end if;
  if v_status <> 'new' then
    raise exception 'ההזמנה כבר בעיצוב או בשלב מאוחר יותר';
  end if;
  update public.orders
  set status = 'design', sent_to_designer_at = coalesce(sent_to_designer_at, now())
  where id = p_order_id;
  perform public.system_message(p_order_id, case when v_role = 'designer' then 'הגרפיקאי אישר והתחיל עיצוב' else 'נשלח לגרפיקאי' end);
  perform public.add_event(p_order_id, 'design_started');
end;
$$;

revoke execute on function public.start_design(bigint) from public, anon;
grant execute on function public.start_design(bigint) to authenticated;
