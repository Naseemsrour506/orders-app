// שולח התראות Web Push לפי טבלת events.
// כל מי שמחובר יכול לקרוא לפונקציה: היא רק שולחת את מה שממתין, לנמענים הנכונים.
// {"op":"vapid"} מחזיר את המפתח הציבורי (ויוצר מפתחות בפעם הראשונה).
// {"op":"morning"} מוסיף סיכום בוקר לכל צוות (נקרא מהמשימה היומית).

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type Member = { id: string; role: "manager" | "designer" | "field"; team_id: number | null; name: string };
type Event = {
  id: number;
  order_id: number | null;
  kind: string;
  actor_id: string | null;
  team_id: number | null;
  body: string;
};

async function vapidKeys() {
  const { data } = await db.from("app_secrets").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  if (map.vapid_public && map.vapid_private) return { publicKey: map.vapid_public, privateKey: map.vapid_private };
  const keys = webpush.generateVAPIDKeys();
  // אם שתי קריאות יצרו מפתחות במקביל, הראשונה נשארת.
  await db.from("app_secrets").upsert(
    [
      { key: "vapid_public", value: keys.publicKey },
      { key: "vapid_private", value: keys.privateKey },
    ],
    { onConflict: "key", ignoreDuplicates: true },
  );
  return vapidKeys();
}

function message(e: Event, title: string, actor?: Member): { title: string; body: string } {
  const t = title ? `#${e.order_id} ${title}` : `#${e.order_id}`;
  switch (e.kind) {
    case "sent_to_designer":
      return { title: "הזמנה חדשה אליך", body: t };
    case "returned":
      return { title: "חזר לתיקון", body: e.body ? `${t}: ${e.body}` : t };
    case "draft":
      return { title: "טיוטה מחכה לאישור", body: t };
    case "final":
      return { title: "קובץ סופי הועלה", body: t };
    case "approved":
      return { title: "עבודה נוספה לרשימה", body: t };
    case "done":
      return { title: "בוצע ✓", body: e.body ? `${t}: ${e.body}` : t };
    case "field_issue":
      return { title: "הערה מהשטח", body: `${t}: ${e.body}` };
    case "message":
      return { title: actor?.name ?? "הודעה חדשה", body: e.body ? `${t}: ${e.body}` : t };
    case "design_started":
      return { title: "הגרפיקאי התחיל לעצב", body: t };
    case "wa_new":
      return { title: "הזמנה חדשה מוואטסאפ", body: t };
    case "wa_message":
      return { title: "הלקוח כתב בוואטסאפ", body: e.body ? `${t}: ${e.body}` : t };
    default:
      return { title: "עדכון", body: t };
  }
}

function recipients(e: Event, members: Member[]): Member[] {
  const managers = members.filter((m) => m.role === "manager");
  const designers = members.filter((m) => m.role === "designer");
  const team = (id: number | null) => members.filter((m) => m.role === "field" && m.team_id === id);
  const notActor = (list: Member[]) => list.filter((m) => m.id !== e.actor_id);
  switch (e.kind) {
    case "sent_to_designer":
    case "returned":
      return designers;
    case "draft":
    case "final":
    case "done":
    case "field_issue":
    case "design_started":
      return notActor(managers);
    // הזמנה מוואטסאפ הולכת ישר לגרפיקאי
    case "wa_new":
    case "wa_message":
      return [...managers, ...designers];
    case "approved":
    case "morning":
      return team(e.team_id);
    case "message": {
      const actor = members.find((m) => m.id === e.actor_id);
      if (actor?.role === "designer") return managers;
      return notActor(designers);
    }
    default:
      return [];
  }
}

async function addMorningSummaries() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const { data: teams } = await db.from("teams").select("id,name");
  const { data: already } = await db
    .from("events")
    .select("team_id")
    .eq("kind", "morning")
    .gte("created_at", new Date(Date.now() - 18 * 3600_000).toISOString());
  for (const team of teams ?? []) {
    if (already?.some((a) => a.team_id === team.id)) continue;
    const { data: tasks } = await db
      .from("orders")
      .select("id,scheduled_date")
      .eq("team_id", team.id)
      .eq("status", "approved")
      .lte("scheduled_date", today);
    const count = tasks?.length ?? 0;
    if (count === 0) continue;
    const carried = tasks!.filter((t) => t.scheduled_date < today).length;
    const body = carried ? `${count} עבודות היום, מתוכן ${carried} מאתמול` : `${count} עבודות היום`;
    await db.from("events").insert({ kind: "morning", team_id: team.id, body });
  }
}

async function flush() {
  const { publicKey, privateKey } = await vapidKeys();
  webpush.setVapidDetails("mailto:orders@example.com", publicKey, privateKey);

  // תופסים את האירועים הממתינים כדי ששתי קריאות במקביל לא ישלחו פעמיים.
  const { data: events, error } = await db
    .from("events")
    .update({ notified_at: new Date().toISOString() })
    .is("notified_at", null)
    .gte("created_at", new Date(Date.now() - 6 * 3600_000).toISOString())
    .select("id,order_id,kind,actor_id,team_id,body");
  if (error) throw error;
  if (!events?.length) return 0;

  const { data: members } = await db.from("members").select("id,role,team_id,name").eq("active", true);
  const { data: subs } = await db.from("push_subscriptions").select("endpoint,member_id,p256dh,auth");
  const orderIds = [...new Set(events.map((e) => e.order_id).filter(Boolean))];
  const { data: orders } = orderIds.length
    ? await db.from("orders").select("id,title,client_name").in("id", orderIds)
    : { data: [] };
  const titleOf = (id: number | null) => {
    const o = orders?.find((x) => x.id === id);
    return o ? [o.title, o.client_name].filter(Boolean).join(" · ") : "";
  };

  let sent = 0;
  for (const e of events as Event[]) {
    const to = recipients(e, (members ?? []) as Member[]);
    const actor = members?.find((m) => m.id === e.actor_id) as Member | undefined;
    const payload =
      e.kind === "morning"
        ? { title: "בוקר טוב", body: e.body, url: "/" }
        : { ...message(e, titleOf(e.order_id), actor), url: `/order/${e.order_id}` };
    for (const m of to) {
      // צוות שטח פותח את הרשימה, לא את כרטיס ההזמנה.
      const data = JSON.stringify(m.role === "field" ? { ...payload, url: "/" } : payload);
      for (const s of (subs ?? []).filter((x) => x.member_id === m.id)) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, {
            TTL: 60 * 60 * 12,
          });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          } else {
            console.error("push failed", code, err);
          }
        }
      }
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body.op === "vapid") {
      const { publicKey } = await vapidKeys();
      return Response.json({ publicKey }, { headers: cors });
    }
    if (body.op === "morning") await addMorningSummaries();
    const sent = await flush();
    return Response.json({ sent }, { headers: cors });
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500, headers: cors });
  }
});
