-- מחיקת הזמנות ההדגמה (scripts/demo.sql). המשתמשים נשארים.
delete from public.orders where client_phone like '050-00000%';
