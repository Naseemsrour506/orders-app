-- נתוני הדגמה: מריצים פעם אחת ב-SQL Editor של Supabase.
-- יוצר גרפיקאי וצוותי שטח (אם עוד אין), ושבע הזמנות לדוגמה בכל השלבים.
-- בסוף מוצגים הקישורים של המשתמשים החדשים. למחיקת ההזמנות: scripts/demo_clear.sql
create temp table if not exists demo_links (who text, link text);
truncate demo_links;

do $$
declare
  base text := 'https://orders-app-5rl.pages.dev/join#t=';
  v_mgr uuid;
  v_des uuid;
  v_f1 uuid;
  v_f2 uuid;
  v_tok text;
  d date := public.today_il();
  o bigint;
begin
  select id into v_mgr from public.members where role = 'manager' order by created_at limit 1;
  if v_mgr is null then
    raise exception 'קודם צריך ליצור מנהל (bootstrap_manager)';
  end if;
  if exists (select 1 from public.orders where client_phone like '050-00000%') then
    raise exception 'נתוני ההדגמה כבר קיימים. למחיקה: scripts/demo_clear.sql';
  end if;

  select id into v_des from public.members where role = 'designer' and active order by created_at limit 1;
  if v_des is null then
    v_tok := public.new_token();
    insert into public.members (name, role) values ('גרפיקאי', 'designer') returning id into v_des;
    insert into public.member_tokens (member_id, token_hash) values (v_des, public.hash_token(v_tok));
    insert into demo_links values ('גרפיקאי', base || v_tok);
  end if;

  select id into v_f1 from public.members where role = 'field' and team_id = 1 and active order by created_at limit 1;
  if v_f1 is null then
    v_tok := public.new_token();
    insert into public.members (name, role, team_id) values ('צוות 1', 'field', 1) returning id into v_f1;
    insert into public.member_tokens (member_id, token_hash) values (v_f1, public.hash_token(v_tok));
    insert into demo_links values ('צוות 1', base || v_tok);
  end if;

  select id into v_f2 from public.members where role = 'field' and team_id = 2 and active order by created_at limit 1;
  if v_f2 is null then
    v_tok := public.new_token();
    insert into public.members (name, role, team_id) values ('צוות 2', 'field', 2) returning id into v_f2;
    insert into public.member_tokens (member_id, token_hash) values (v_f2, public.hash_token(v_tok));
    insert into demo_links values ('צוות 2', base || v_tok);
  end if;

  -- 1. חדשה: הגיעה מהלקוח, עוד לא נשלחה לגרפיקאי
  insert into public.orders (title, client_name, client_phone, address, created_by, created_at)
  values ('שלט חזית מואר', 'מאפיית השכונה', '050-0000001', 'הרצל 12, חיפה', v_mgr, now() - interval '20 minutes')
  returning id into o;
  insert into public.messages (order_id, author_id, body, created_at) values
    (o, v_mgr, 'שלט 3 מטר על 80 ס"מ, רקע לבן ולוגו חום. הלקוח רוצה לראות שתי אפשרויות.', now() - interval '19 minutes');

  -- 2. בעבודה אצל הגרפיקאי
  insert into public.orders (title, client_name, client_phone, address, status, design_due, sent_to_designer_at, created_by, created_at)
  values ('מדבקות לשני רכבים', 'הובלות כהן', '050-0000002', 'התעשייה 5, נשר', 'design', d + 2, now() - interval '3 hours', v_mgr, now() - interval '4 hours')
  returning id into o;
  insert into public.messages (order_id, author_id, body, created_at) values
    (o, v_mgr, 'לוגו בצד הנהג ובדלת האחורית, מספר טלפון גדול. מידות הרכב בתמונה.', now() - interval '3 hours'),
    (o, v_des, 'קיבלתי, שולח טיוטה מחר בבוקר.', now() - interval '2 hours');

  -- 3. חזרה לתיקון
  insert into public.orders (title, client_name, client_phone, address, status, design_due, sent_to_designer_at, created_by, created_at)
  values ('רול-אפ לכנס', 'משרד עו"ד לוי', '050-0000003', 'שד׳ הנשיא 40, חיפה', 'fix', d + 1, now() - interval '1 day', v_mgr, now() - interval '1 day')
  returning id into o;
  insert into public.messages (order_id, author_id, kind, body, created_at) values
    (o, v_mgr, 'text', 'רול-אפ 85 על 200, הטקסט מצורף.', now() - interval '1 day'),
    (o, v_des, 'text', 'הטיוטה מוכנה, מחכה לאישור.', now() - interval '5 hours'),
    (o, v_mgr, 'text', 'הלקוח מבקש להגדיל את הלוגו ולהחליף את הכחול לירוק.', now() - interval '1 hour');

  -- 4. מאושר להיום, צוות 1, דחוף
  insert into public.orders (title, client_name, client_phone, address, field_notes, status, scheduled_date, team_id, urgent,
                             sent_to_designer_at, approved_at, created_by, created_at)
  values ('החלפת שלט בכניסה', 'קפה מרכז', '050-0000004', 'מוריה 88, חיפה', 'להגיע לפני 10:00, אחרי זה יש לקוחות. סולם 3 מטר.',
          'approved', d, 1, true, now() - interval '2 days', now() - interval '1 day', v_mgr, now() - interval '3 days')
  returning id into o;
  insert into public.messages (order_id, author_id, body, created_at) values
    (o, v_mgr, 'מאושר. דחוף, הלקוח פותח מחר.', now() - interval '1 day');

  -- 5. מאתמול: לא בוצע אתמול, עולה לראש הרשימה של צוות 1
  insert into public.orders (title, client_name, client_phone, address, field_notes, status, scheduled_date, team_id,
                             sent_to_designer_at, approved_at, created_by, created_at)
  values ('הדבקת ויטרינה', 'אופטיקה ברק', '050-0000005', 'חורב 3, חיפה', 'שתי ויטרינות, לנקות זכוכית לפני.',
          'approved', d - 1, 1, now() - interval '4 days', now() - interval '2 days', v_mgr, now() - interval '5 days');

  -- 6. מאושר להיום, צוות 2
  insert into public.orders (title, client_name, client_phone, address, field_notes, status, scheduled_date, team_id,
                             sent_to_designer_at, approved_at, created_by, created_at)
  values ('שילוט הכוונה בחניון', 'מרכז מסחרי הגליל', '050-0000006', 'דרך העצמאות 1, קריית אתא', 'שישה שלטים, ברגים בארגז.',
          'approved', d, 2, now() - interval '3 days', now() - interval '1 day', v_mgr, now() - interval '4 days');

  -- 7. בוצע אתמול
  insert into public.orders (title, client_name, client_phone, address, status, scheduled_date, team_id,
                             sent_to_designer_at, approved_at, done_at, done_by, done_note, created_by, created_at)
  values ('בד פרסום לגדר', 'גני אירועים הדר', '050-0000007', 'כביש 4, צומת יגור', 'done', d - 1, 1,
          now() - interval '5 days', now() - interval '3 days', now() - interval '20 hours', v_f1, 'נתלה, הלקוח מרוצה.', v_mgr, now() - interval '6 days');

  -- בלי התראות על הודעות ההדגמה
  delete from public.events where order_id in (select id from public.orders where client_phone like '050-00000%');
end;
$$;

select coalesce((select string_agg(who || ':  ' || link, E'\n' order by who) from demo_links),
                'ההזמנות נוצרו. המשתמשים כבר היו קיימים, אז אין קישורים חדשים') as "תוצאה";
