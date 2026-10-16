-- בדיקת זרימה מלאה עם הרשאות. מריצים: test/run.sh
\set ON_ERROR_STOP 1
\set QUIET 1

-- המנהל
select public.bootstrap_manager('נסים') as mtoken \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select (public.claim_invite(:'mtoken')->>'role') = 'manager' as manager_claimed \gset
\if :manager_claimed \else \echo FAIL manager claim \quit \endif

select public.create_member('גרפיקאי', 'designer')->>'token' as dtoken \gset
select public.create_member('צוות 1', 'field', 1::smallint)->>'token' as f1token \gset
select public.create_member('צוות 2', 'field', 2::smallint)->>'token' as f2token \gset

select public.create_order('שלט חזית', 'קפה הנמל', '0500000000', 'הדייגים 3, עכו', null) as oid \gset
insert into public.messages (order_id, author_id, kind, body) values (:oid, public.current_member_id(), 'text', 'לבן עם לוגו ירוק');

-- גרפיקאי רואה גם הזמנה חדשה שעוד לא נשלחה אליו, עם ההודעות שלה
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.claim_invite(:'dtoken');
select count(*) = 1 as ok from public.orders where status = 'new' \gset
\if :ok \else \echo FAIL designer cannot see new order \quit \endif
select count(*) = 1 as ok from public.messages where order_id = :oid \gset
\if :ok \else \echo FAIL designer cannot see messages of new order \quit \endif
-- אבל לא יכול לעדכן ישירות
update public.orders set status = 'done' where id = :oid;
select status = 'new' as ok from public.orders where id = :oid \gset
\if :ok \else \echo FAIL designer updated order directly \quit \endif

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.send_to_designer(:oid);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select count(*) = 1 as ok from public.orders \gset
\if :ok \else \echo FAIL designer cannot see sent order \quit \endif
select count(*) = 2 as ok from public.messages where order_id = :oid \gset
\if :ok \else \echo FAIL designer messages \quit \endif
insert into public.messages (order_id, author_id, kind, body, file_path, file_name)
values (:oid, public.current_member_id(), 'draft', 'טיוטה', 'orders/' || :oid || '/d.jpg', 'd.jpg');
select status = 'review' as ok from public.orders where id = :oid \gset
\if :ok \else \echo FAIL draft did not move to review \quit \endif
-- גרפיקאי לא יכול לשנות סטטוס
\set ON_ERROR_STOP 0
select public.send_to_designer(:oid);
\set ON_ERROR_STOP 1
update public.orders set status = 'done' where id = :oid;
select status = 'review' as ok from public.orders where id = :oid \gset
\if :ok \else \echo FAIL designer changed status \quit \endif
select public.can_write_file('orders/' || :oid || '/x.pdf') as ok \gset
\if :ok \else \echo FAIL designer storage write \quit \endif

-- מנהל מחזיר לתיקון, גרפיקאי שולח שוב, מנהל מאשר לצוות 1 לאתמול (כדי לבדוק "מאתמול")
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.return_for_fix(:oid, 'להגדיל לוגו');
select status = 'fix' as ok from public.orders where id = :oid \gset
\if :ok \else \echo FAIL fix \quit \endif
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
insert into public.messages (order_id, author_id, kind, file_path, file_name)
values (:oid, public.current_member_id(), 'final', 'orders/' || :oid || '/final.pdf', 'final.pdf');
insert into public.messages (order_id, author_id, kind, file_path, file_name)
values (:oid, public.current_member_id(), 'draft', 'orders/' || :oid || '/d2.jpg', 'd2.jpg');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.approve_order(:oid, 1::smallint, public.today_il() - 1, null, 'להביא סולם');

-- צוות 2 לא רואה, צוות 1 רואה עם "מאתמול"
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select public.claim_invite(:'f2token');
select count(*) = 0 as ok from public.field_tasks() \gset
\if :ok \else \echo FAIL team 2 sees team 1 task \quit \endif
select count(*) = 0 as ok from public.orders \gset
\if :ok \else \echo FAIL field reads orders table \quit \endif
select count(*) = 0 as ok from public.messages \gset
\if :ok \else \echo FAIL field reads messages \quit \endif

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select public.claim_invite(:'f1token');
-- טלפון שני של אותו צוות
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
select public.claim_invite(:'f1token');
select carried and final_file_name = 'final.pdf' as ok from public.field_tasks() where id = :oid \gset
\if :ok \else \echo FAIL team 1 task / carried / final file \quit \endif
select public.can_read_file('orders/' || :oid || '/final.pdf') and not public.can_read_file('orders/' || :oid || '/d2.jpg') as ok \gset
\if :ok \else \echo FAIL field file access \quit \endif
select public.can_write_file('orders/' || :oid || '/done/p.jpg') and not public.can_write_file('orders/' || :oid || '/x.jpg') as ok \gset
\if :ok \else \echo FAIL field write access \quit \endif
select public.field_mark_done(:oid, 'orders/' || :oid || '/done/p.jpg', '');
select public.field_mark_done(:oid, 'orders/' || :oid || '/done/p.jpg', ''); -- כפול, לא אמור להיכשל
select done as ok from public.field_tasks() where id = :oid \gset
\if :ok \else \echo FAIL done \quit \endif

-- ביטול קישור: הטלפונים הישנים מאבדים גישה
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select id as f1id from public.members where name = 'צוות 1' \gset
select public.reset_member_link(:'f1id');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select public.whoami() is null as ok \gset
\if :ok \else \echo FAIL revoked link still works \quit \endif
\set ON_ERROR_STOP 0
select public.claim_invite(:'f1token');
\set ON_ERROR_STOP 1

-- אנונימי בלי קישור
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', false);
select count(*) = 0 as ok from public.orders \gset
\if :ok \else \echo FAIL stranger sees orders \quit \endif

-- וואטסאפ: רק השרת יכול לפתוח הזמנה, וכמה הודעות מאותו לקוח נכנסות לאותה הזמנה
reset role;
select not has_function_privilege('authenticated', 'public.wa_order_for(text, text)', 'execute')
   and not has_function_privilege('authenticated', 'public.wa_forward_order_for(text, text, text, text, int, bigint, boolean)', 'execute')
   and not has_table_privilege('authenticated', 'public.wa_inbox', 'select') as ok \gset
\if :ok \else \echo FAIL app users can reach whatsapp internals \quit \endif
set role service_role;
select order_id as waoid, created from public.wa_order_for('972500000001', 'דנה') \gset
\if :created \else \echo FAIL first whatsapp message did not open order \quit \endif
select (not created) and order_id = :waoid as ok from public.wa_order_for('972500000001', 'דנה') \gset
\if :ok \else \echo FAIL second whatsapp message opened another order \quit \endif
select client_phone = '0500000001' and source = 'whatsapp' and status = 'new' as ok from public.orders where id = :waoid \gset
\if :ok \else \echo FAIL whatsapp order fields \quit \endif
insert into public.messages (order_id, kind, body) values (:waoid, 'text', 'שלט 2 על 1');

-- העברה מהמנהל: רצף אחד = הזמנה אחת, איש קשר ממלא את הלקוח
create function pg_temp.fwd(p_id text, p_phone text default '', p_name text default '', p_target bigint default null, p_new boolean default false)
returns table (order_id bigint, created boolean) language sql as $f$
  insert into public.wa_inbox (wa_message_id, phone) values (p_id, '972400000009');
  select * from public.wa_forward_order_for('972400000009', p_id, p_phone, p_name, 10, p_target, p_new);
$f$;
select order_id as f1, created from pg_temp.fwd('f1') \gset
\if :created \else \echo FAIL first forward did not open order \quit \endif
select (not created) and order_id = :f1 as ok from pg_temp.fwd('f2') \gset
\if :ok \else \echo FAIL forward in same burst opened another order \quit \endif
select (not created) and order_id = :f1 as ok from pg_temp.fwd('f3', '972520000002', 'יוסי') \gset
\if :ok \else \echo FAIL contact did not attach to current forward order \quit \endif
select client_phone = '0520000002' and client_name = 'יוסי' and wa_phone = '972520000002' as ok from public.orders where id = :f1 \gset
\if :ok \else \echo FAIL contact fields not filled \quit \endif
select created and order_id <> :f1 as ok, order_id as f2 from pg_temp.fwd('f4', '972530000003', 'רונית') \gset
\if :ok \else \echo FAIL second customer contact did not open a new order \quit \endif
-- "#מספר" מחזיר להזמנה הראשונה, וההודעה הבאה נכנסת אליה
select order_id = :f1 as ok from pg_temp.fwd('f5', '', '', :f1) \gset
\if :ok \else \echo FAIL order number did not select order \quit \endif
select (not created) and order_id = :f1 as ok from pg_temp.fwd('f6') \gset
\if :ok \else \echo FAIL message after order number went elsewhere \quit \endif
select order_id is null as ok from pg_temp.fwd('f7', '', '', 999999) \gset
\if :ok \else \echo FAIL unknown order number returned an order \quit \endif
-- "חדש" פותח הזמנה גם באמצע רצף
select created and order_id not in (:f1, :f2) as ok from pg_temp.fwd('f8', '', '', null, true) \gset
\if :ok \else \echo FAIL new command did not open order \quit \endif
update public.wa_inbox set received_at = now() - interval '1 hour';
select created as ok from pg_temp.fwd('f9') \gset
\if :ok \else \echo FAIL forward after a long gap did not open new order \quit \endif
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select count(*) = 1 as ok from public.messages where order_id = :waoid and author_id is null and kind = 'text' \gset
\if :ok \else \echo FAIL manager cannot see customer message \quit \endif

-- הגרפיקאי רואה את ההזמנה מוואטסאפ ואת מה שהלקוח שלח, ומאשר להתחיל עיצוב
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select count(*) = 1 as ok from public.messages where order_id = :waoid and author_id is null and kind = 'text' \gset
\if :ok \else \echo FAIL designer cannot see customer message \quit \endif
select public.start_design(:waoid);
select status = 'design' and sent_to_designer_at is not null as ok from public.orders where id = :waoid \gset
\if :ok \else \echo FAIL designer start_design \quit \endif
select count(*) = 1 as ok from public.messages where order_id = :waoid and kind = 'system' and body = 'הגרפיקאי אישר והתחיל עיצוב' \gset
\if :ok \else \echo FAIL start_design system message \quit \endif
-- פעם שנייה נכשלת, וצוות שטח לא יכול בכלל
\set ON_ERROR_STOP 0
select public.start_design(:waoid);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select public.start_design(:f2);
\set ON_ERROR_STOP 1
reset role;
select status = 'new' as ok from public.orders where id = :f2 \gset
\if :ok \else \echo FAIL field user started design \quit \endif
set role authenticated;

-- זרימה פשוטה: הגרפיקאי שולח עיצוב ישר מהזמנה חדשה, וההזמנה עוברת למנהל לאישור
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
insert into public.messages (order_id, author_id, kind, file_path, file_name)
values (:f1, public.current_member_id(), 'draft', 'orders/' || :f1 || '/design.jpg', 'design.jpg');
select status = 'review' and sent_to_designer_at is not null as ok from public.orders where id = :f1 \gset
\if :ok \else \echo FAIL draft from new order did not move to review \quit \endif

reset role;
select count(*) as events from public.events;
\echo ALL TESTS PASSED
