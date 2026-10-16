-- פרטי ההזמנה שה-AI חילץ מההודעות, לפי שדות (מידות, כמות, חומר...), ומה עוד חסר.
alter table public.orders add column ai_details jsonb not null default '{}';
-- מה כבר נשלח ללקוח בוואטסאפ, כדי לא לשאול אותו שוב על אותו דבר.
alter table public.orders add column wa_replies jsonb not null default '{}';
