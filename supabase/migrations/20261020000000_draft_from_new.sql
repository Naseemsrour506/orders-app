-- זרימה פשוטה: הגרפיקאי יכול לשלוח עיצוב גם מהזמנה חדשה, בלי שלב "התחלת עיצוב".
-- עיצוב (draft) מעביר את ההזמנה למנהל לאישור.
create or replace function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.member_role;
begin
  if new.kind = 'system' then
    return new;
  end if;
  select role into v_role from public.members where id = new.author_id;

  if new.kind = 'draft' then
    update public.orders set status = 'review', sent_to_designer_at = coalesce(sent_to_designer_at, now())
    where id = new.order_id and status in ('new', 'design', 'fix');
    insert into public.events (order_id, kind, actor_id) values (new.order_id, 'draft', new.author_id);
    return new;
  end if;

  if new.kind = 'final' then
    update public.orders set final_file_path = new.file_path, final_file_name = new.file_name
    where id = new.order_id;
    insert into public.events (order_id, kind, actor_id) values (new.order_id, 'final', new.author_id);
    return new;
  end if;

  if v_role in ('manager', 'designer') then
    insert into public.events (order_id, kind, actor_id, body)
    values (new.order_id, 'message', new.author_id, left(new.body, 120));
  end if;
  return new;
end;
$$;

revoke execute on function public.on_message_insert() from public, anon, authenticated;
