// מקבל הודעות מהמספר העסקי בוואטסאפ (WhatsApp Cloud API של Meta) והופך אותן להזמנות.
//
// GET  - אימות הכתובת מול Meta (hub.challenge)
// POST - הודעה חדשה: נשמרת בכרטיס ההזמנה של אותו לקוח (או בהזמנה חדשה),
//        ואחרי שהלקוח מסיים לשלוח, ה-AI ממלא את פרטי ההזמנה והמנהל מקבל התראה.
// POST /send - מהאפליקציה, למנהל בוואטסאפ: {"kind":"design"} שולח את העיצוב האחרון של ההזמנה,
//        או {"kind":"ask","text":...} מה לבקש מהלקוח, והמנהל מעביר ללקוח.
//        {"order_id": 1003, "text": "...", "asked": ["מידות"]}. דורש משתמש מחובר.
//
// סודות (Supabase ← Edge Functions ← Secrets, או דרך GitHub Secrets):
//   WHATSAPP_VERIFY_TOKEN  מילה סודית שבוחרים ומדביקים גם ב-Meta
//   WHATSAPP_APP_SECRET    App secret של האפליקציה ב-Meta (לבדיקה שההודעה באמת מ-Meta)
//   WHATSAPP_TOKEN         טוקן קבוע של System user, לשליחת תשובה ולהורדת תמונות
//   ANTHROPIC_API_KEY      בשביל ה-AI. בלי זה ההודעות נשמרות, רק בלי מילוי אוטומטי
// לא חובה:
//   WHATSAPP_MANAGERS      מצב "העברה": מספרי המנהלים (972..., מופרד בפסיקים). כשמוגדר, מקבלים הודעות רק מהם:
//                          הלקוחות כותבים למנהל, והמנהל מעביר למספר העסקי רק את מה שהוא הזמנה.
//                          רצף העברות = הזמנה אחת, איש קשר של לקוח ממלא שם וטלפון, והמנהל מקבל סיכום ומה חסר.
//                          המנהל יכול לכתוב "#1003" כדי שההודעות הבאות ייכנסו להזמנה 1003, או "חדש" להזמנה חדשה.
//   WHATSAPP_PHONE_NUMBER_ID  מזהה המספר העסקי ב-Meta, לשליחה מהאפליקציה. בלי זה משתמשים במספר
//                          שקיבל את ההודעה האחרונה מוואטסאפ
//   APP_URL                כתובת האפליקציה לקישור בסיכום למנהל. ברירת מחדל https://orders-app-5rl.pages.dev
//   WHATSAPP_AUTO_REPLY    נוסח האישור כשאין AI. {id} מוחלף במספר ההזמנה. "off" מבטל כל תשובה ללקוח
//   ANTHROPIC_MODEL        ברירת מחדל claude-opus-5-5

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";

const GRAPH = "https://graph.facebook.com/v23.0";
// כמה זמן לחכות לעוד הודעות מאותו לקוח לפני שה-AI קורא הכל ביחד
const QUIET_MS = 20_000;
// במצב העברה: אחרי כמה דקות בלי הודעה, ההעברה הבאה פותחת הזמנה חדשה
const FORWARD_GAP_MIN = 10;

const managers = () =>
  env("WHATSAPP_MANAGERS")
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean);

/** מספר בפורמט של וואטסאפ (972...) מתוך מה שכתוב באיש קשר */
function waNumber(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) return "972" + d.slice(1);
  return d;
}

const env = (k: string) => Deno.env.get(k) ?? "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

// ---------------------------------------------------------------------------
// אבטחה
// ---------------------------------------------------------------------------

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = env("WHATSAPP_APP_SECRET");
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7);
  if (got.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

type WaMessage = {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: WaMedia;
  document?: WaMedia & { filename?: string };
  audio?: WaMedia;
  video?: WaMedia;
  sticker?: WaMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string; wa_id?: string }[] }[];
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};
type WaMedia = { id: string; mime_type?: string; caption?: string };

type Incoming = { msg: WaMessage; name: string; phoneNumberId: string };

function incoming(payload: any): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v?.messages) continue; // עדכוני "נמסר/נקרא" לא מעניינים אותנו
      for (const msg of v.messages as WaMessage[]) {
        const contact = (v.contacts ?? []).find((c: any) => c.wa_id === msg.from) ?? v.contacts?.[0];
        out.push({ msg, name: contact?.profile?.name ?? "", phoneNumberId: v.metadata?.phone_number_id ?? "" });
      }
    }
  }
  return out;
}

async function graph(path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${await res.text()}`);
  return res;
}

async function downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await (await graph(mediaId)).json();
  const res = await fetch(meta.url, { headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}` } });
  if (!res.ok) throw new Error(`media ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: meta.mime_type ?? "application/octet-stream" };
}

async function sendText(phoneNumberId: string, to: string, body: string) {
  await graph(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
}

/** שולח קובץ מקישור, כתמונה או כמסמך, עם כיתוב */
async function sendFile(phoneNumberId: string, to: string, link: string, mime: string, caption: string, filename: string) {
  const media = mime.startsWith("image/")
    ? { type: "image", image: { link, caption } }
    : { type: "document", document: { link, caption, filename } };
  await graph(`${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, ...media }),
  });
}

// המספר העסקי שממנו שולחים מהאפליקציה. נשמר מההודעות הנכנסות, כדי שלא יהיה חובה להגדיר אותו.
let knownNumberId = "";
async function rememberNumberId(id: string) {
  if (!id || id === knownNumberId) return;
  knownNumberId = id;
  await db.from("app_secrets").upsert({ key: "wa_phone_number_id", value: id }, { onConflict: "key" });
}
async function businessNumberId(): Promise<string> {
  if (env("WHATSAPP_PHONE_NUMBER_ID")) return env("WHATSAPP_PHONE_NUMBER_ID");
  const { data } = await db.from("app_secrets").select("value").eq("key", "wa_phone_number_id").maybeSingle();
  return data?.value ?? "";
}

// ---------------------------------------------------------------------------
// שמירה בכרטיס
// ---------------------------------------------------------------------------

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
};

function textOf(m: WaMessage): string {
  switch (m.type) {
    case "text":
      return m.text?.body ?? "";
    case "location": {
      const l = m.location!;
      const where = [l.name, l.address].filter(Boolean).join(", ");
      return `📍 ${where ? where + " " : ""}https://maps.google.com/?q=${l.latitude},${l.longitude}`;
    }
    case "contacts":
      return (m.contacts ?? [])
        .map((c) => `👤 ${c.name?.formatted_name ?? ""} ${(c.phones ?? []).map((p) => p.phone).join(" ")}`.trim())
        .join("\n");
    case "button":
      return m.button?.text ?? "";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
    default:
      return "";
  }
}

/** שומר הודעה אחת בכרטיס, עם הקובץ אם יש */
async function store(orderId: number, m: WaMessage) {
  const media = m.image ?? m.document ?? m.audio ?? m.video ?? m.sticker;
  if (!media) {
    const body = textOf(m) || `[הודעה מסוג ${m.type} שלא נתמכת. כדאי לבקש מהלקוח לשלוח שוב]`;
    const { error } = await db.from("messages").insert({ order_id: orderId, kind: "text", body });
    if (error) throw error;
    return;
  }
  let path: string | null = null;
  let mime = media.mime_type?.split(";")[0] ?? "";
  let size: number | null = null;
  let body = media.caption ?? "";
  try {
    const file = await downloadMedia(media.id);
    mime = file.mime.split(";")[0];
    size = file.bytes.length;
    path = `orders/${orderId}/wa-${m.id.replace(/[^A-Za-z0-9_-]/g, "").slice(-40)}.${EXT[mime] ?? "bin"}`;
    const up = await db.storage.from("files").upload(path, file.bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
  } catch (err) {
    console.error("media download failed", err);
    path = null;
    body = [body, "[קובץ שלא הצלחתי להוריד מוואטסאפ]"].filter(Boolean).join("\n");
  }
  const kind = !path ? "text" : m.type === "image" || m.type === "sticker" ? "image" : m.type === "audio" ? "audio" : "file";
  const name = m.document?.filename ?? (path ? path.split("/").pop() : null);
  const { error } = await db.from("messages").insert({
    order_id: orderId,
    kind,
    body,
    file_path: path,
    file_name: path ? name : null,
    mime: path ? mime : null,
    size_bytes: path ? size : null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// AI: קורא את כל מה שהלקוח שלח וממלא את פרטי ההזמנה
// ---------------------------------------------------------------------------

const FIELDS = ["title", "client_name", "address", "design_due"] as const;

// פרטים לפי שדות. נשמרים ב-orders.ai_details ומוצגים בכרטיס ההזמנה.
const DETAILS = {
  product: "סוג המוצר, למשל: שלט חזית, באנר, מדבקה לרכב, כרטיסי ביקור",
  size: "מידות, כולל יחידה. למשל: 200x100 ס\"מ",
  quantity: "כמות",
  material: "חומר או סוג הדפסה, למשל: אלומיניום, PVC, ויניל, פלקס",
  print_text: "הטקסט שיופיע על המוצר, מילה במילה",
  design: "צבעים, לוגו, סגנון, או 'יש קובץ מוכן'",
  lighting: "תאורה, אם רלוונטי לשלט: מואר / לא מואר",
  installation: "האם צריך התקנה: כן / לא",
  city: "עיר",
  contact_phone: "טלפון נוסף שהלקוח נתן, אם נתן",
  notes: "כל דבר חשוב אחר",
} as const;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "מה מזמינים, בכמה מילים. למשל: שלט חזית מואר 3x1 מ'" },
    client_name: { type: "string", description: "שם הלקוח או העסק, אם נאמר בהודעות. אחרת ריק" },
    address: { type: "string", description: "רחוב ומספר לביצוע/התקנה, אם נאמרו. אחרת ריק" },
    design_due: { type: "string", description: "תאריך יעד בפורמט YYYY-MM-DD אם הלקוח ביקש עד תאריך. אחרת ריק" },
    details: {
      type: "object",
      properties: Object.fromEntries(Object.entries(DETAILS).map(([k, d]) => [k, { type: "string", description: d + ". ריק אם לא נאמר" }])),
      required: Object.keys(DETAILS),
      additionalProperties: false,
    },
    missing: {
      type: "array",
      items: { type: "string" },
      description:
        "מה חסר כדי להתחיל לעבוד, לכל היותר 4, רק החשובים. כל פריט בכמה מילים, מנוסח ללקוח. למשל: מידות מדויקות, הטקסט שיופיע על השלט",
    },
    summary: { type: "string", description: "משפט או שניים בעברית: מה הלקוח רוצה" },
  },
  required: ["title", "client_name", "address", "design_due", "details", "missing", "summary"],
  additionalProperties: false,
};

const SYSTEM = `אתה עוזר בעסק לשילוט ודפוס. לקוחות שולחים הודעות ותמונות בוואטסאפ, ואתה ממלא מהן כרטיס הזמנה לפי שדות.
כתוב בעברית. אל תמציא פרטים: מה שלא נאמר נשאר ריק. אם יש סתירה, ההודעה המאוחרת קובעת.
ב-missing רשום רק מה שבאמת חסר כדי להתחיל עיצוב או הצעת מחיר. אל תבקש שוב משהו שהלקוח כבר נתן.`;

type Extracted = {
  title: string;
  client_name: string;
  address: string;
  design_due: string;
  details: Record<string, string>;
  missing: string[];
  summary: string;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function extract(orderId: number): Promise<Extracted | null> {
  if (!env("ANTHROPIC_API_KEY")) return null;
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!order || order.status !== "new") return null; // אחרי שהמנהל התחיל לטפל, לא נוגעים בפרטים

  const { data: msgs } = await db
    .from("messages")
    .select("kind,body,file_path,mime,created_at")
    .eq("order_id", orderId)
    .is("author_id", null)
    .neq("kind", "system")
    .order("created_at")
    .order("id");
  if (!msgs?.length) return null;

  // עד 6 התמונות האחרונות, כדי לשמור על עלות נמוכה
  const withImage = new Set(
    msgs.filter((m) => m.kind === "image" && m.file_path && IMAGE_TYPES.includes(m.mime)).slice(-6).map((m) => m.file_path),
  );
  const content: Anthropic.ContentBlockParam[] = [];
  const fmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" });
  for (const m of msgs) {
    if (m.file_path && withImage.has(m.file_path)) {
      const { data: blob } = await db.storage.from("files").download(m.file_path);
      if (blob && blob.size < 4_500_000) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: m.mime, data: toBase64(new Uint8Array(await blob.arrayBuffer())) },
        });
      }
    }
    const what = m.kind === "text" ? "" : m.kind === "image" ? "[תמונה] " : m.kind === "audio" ? "[הקלטה קולית] " : "[קובץ] ";
    if (what || m.body) content.push({ type: "text", text: `${fmt.format(new Date(m.created_at))}: ${what}${m.body}` });
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  content.push({
    type: "text",
    text:
      `היום ${today}. שם הלקוח: ${order.client_name || "לא ידוע"}. מלא את כרטיס ההזמנה מההודעות למעלה.` +
      (order.wa_forwarded_by
        ? "\nההודעות הועברו על ידי המנהל מהשיחה שלו עם הלקוח. ייתכן שחלקן הערות של המנהל עצמו."
        : "") +
      (order.wa_replies?.asked?.length
        ? `\nכבר ביקשנו מהלקוח: ${order.wa_replies.asked.join("; ")}. פריט שעדיין חסר, כתוב ב-missing באותו נוסח בדיוק.`
        : ""),
  });

  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: env("ANTHROPIC_MODEL") || "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal") {
    console.error("AI declined", res.stop_details);
    return null;
  }
  const text = res.content.find((b) => b.type === "text");
  if (text?.type !== "text") return null;
  const out = JSON.parse(text.text) as Extracted;
  if (out.design_due && !/^\d{4}-\d{2}-\d{2}$/.test(out.design_due)) out.design_due = "";
  const details: Record<string, string> = {};
  for (const k of Object.keys(DETAILS)) {
    const v = (out.details?.[k] ?? "").trim();
    if (v) details[k] = v;
  }
  out.missing = (out.missing ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 4);

  // ממלאים רק שדות ריקים או שה-AI מילא בעצמו. מה שהמנהל כתב נשאר.
  const fresh = (await db.from("orders").select("*").eq("id", orderId).single()).data ?? order;
  if (fresh.status !== "new") return null;
  const prev = (fresh.ai_fields ?? {}) as Record<string, string>;
  const update: Record<string, unknown> = {
    ai_summary: out.summary ?? "",
    ai_details: { ...details, missing: out.missing },
  };
  const ai: Record<string, string> = { ...prev };
  for (const f of FIELDS) {
    const current = fresh[f] ?? "";
    const value = (out[f] ?? "").trim();
    if (!value) continue;
    if (current === "" || current === (prev[f] ?? "")) {
      update[f] = value;
      ai[f] = value;
    }
  }
  update.ai_fields = ai;
  const { error } = await db.from("orders").update(update).eq("id", orderId);
  if (error) throw error;
  return out;
}

// ---------------------------------------------------------------------------
// תשובה ללקוח: תודה, ומה עוד חסר. לא שואלים פעמיים על אותו דבר.
// ---------------------------------------------------------------------------

type Replies = { greeted?: boolean; asked?: string[]; complete?: boolean };

async function answerCustomer(orderId: number, phoneNumberId: string, to: string, out: Extracted | null) {
  if (!env("WHATSAPP_TOKEN") || env("WHATSAPP_AUTO_REPLY") === "off") return;
  const { data: order } = await db.from("orders").select("status,wa_replies").eq("id", orderId).single();
  if (!order || order.status !== "new") return;
  const sent = (order.wa_replies ?? {}) as Replies;
  const asked = new Set(sent.asked ?? []);
  const thanks = sent.greeted ? "תודה!" : `תודה! קיבלנו את הפנייה (הזמנה #${orderId}) 🙏`;
  let body = "";
  const next: Replies = { ...sent, greeted: true };

  if (!out) {
    // בלי AI: רק אישור קבלה, פעם אחת
    if (!sent.greeted) body = env("WHATSAPP_AUTO_REPLY").replaceAll("{id}", String(orderId)) || `${thanks} נחזור אליך בהקדם.`;
  } else if (out.missing.length && out.missing.some((m) => !asked.has(m))) {
    body = `${thanks}\nכדי שנוכל להתחיל, נשמח לעוד כמה פרטים:\n${out.missing.map((m) => `• ${m}`).join("\n")}`;
    next.asked = [...new Set([...asked, ...out.missing])];
  } else if (!out.missing.length && !sent.complete) {
    body = `${thanks} יש לנו את כל הפרטים להזמנה #${orderId}, ונחזור אליך בהקדם עם הדמיה.`;
    next.complete = true;
  } else if (!sent.greeted) {
    body = `${thanks} נחזור אליך בהקדם.`;
  }
  if (!body) return;
  await sendText(phoneNumberId, to, body);
  await db.from("orders").update({ wa_replies: next }).eq("id", orderId);
  // שהמנהל יראה בכרטיס מה נשלח ללקוח
  await db.from("messages").insert({ order_id: orderId, kind: "system", body: `נשלח ללקוח בוואטסאפ: ${body}` });
}

const DETAIL_LABEL: Record<string, string> = {
  product: "מוצר",
  size: "מידות",
  quantity: "כמות",
  material: "חומר",
  print_text: "טקסט",
  design: "עיצוב",
  lighting: "תאורה",
  installation: "התקנה",
  city: "עיר",
  contact_phone: "טלפון נוסף",
  notes: "הערות",
};

const appLink = (orderId: number) => `${env("APP_URL") || "https://orders-app-5rl.pages.dev"}/order/${orderId}`;

type FormOrder = {
  client_name: string;
  client_phone: string;
  address: string;
  design_due: string | null;
  ai_details: Record<string, unknown> | null;
};

/** טופס ההזמנה כהודעת וואטסאפ: רק מה שידוע, באותו סדר תמיד, ושורה של מה שחסר. */
function orderForm(orderId: number, order: FormOrder, out: Extracted | null): string {
  const d = order.ai_details ?? {};
  const v = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const fields: [string, string][] = [
    ["טלפון", v(order.client_phone)],
    ["כתובת", v(order.address)],
    ...Object.entries(DETAIL_LABEL).map(([k, label]) => [label, v(d[k])] as [string, string]),
    ["תאריך יעד", v(order.design_due)],
  ];
  const lines = [
    `📋 הזמנה #${orderId} · ${v(order.client_name) || "לא צוין שם"}`,
    ...fields.filter(([, x]) => x).map(([label, x]) => `${label}: ${x}`),
  ];
  const missing = Array.isArray(d.missing) ? (d.missing as string[]) : [];
  lines.push("", !out ? "ההודעות נשמרו בהזמנה." : missing.length ? `⚠️ חסר: ${missing.join(", ")}` : "✓ יש את כל הפרטים");
  lines.push(appLink(orderId));
  return lines.join("\n");
}

/** במצב העברה: המנהל מקבל סיכום של ההזמנה ומה חסר, כדי שיחליט מה לשאול את הלקוח */
async function answerManager(orderId: number, phoneNumberId: string, to: string, out: Extracted | null) {
  if (!env("WHATSAPP_TOKEN") || env("WHATSAPP_AUTO_REPLY") === "off") return;
  const { data: order } = await db
    .from("orders")
    .select("title,client_name,client_phone,address,design_due,ai_details,status,wa_replies")
    .eq("id", orderId)
    .single();
  if (!order) return;
  const body = orderForm(orderId, order, out);
  const sent = (order.wa_replies ?? {}) as Replies & { manager?: string };
  if (sent.manager === body) return; // אותו סיכום כבר נשלח
  await sendText(phoneNumberId, to, body);
  await db.from("orders").update({ wa_replies: { ...sent, manager: body } }).eq("id", orderId);
}

// ---------------------------------------------------------------------------
// עיבוד
// ---------------------------------------------------------------------------

async function handle({ msg, name, phoneNumberId }: Incoming) {
  await rememberNumberId(phoneNumberId).catch((e) => console.error("remember number failed", e));
  const forwardMode = managers().length > 0;
  if (forwardMode && !managers().includes(msg.from)) return; // במצב העברה מקבלים רק מהמנהל

  // פעם אחת לכל הודעה
  const { data: fresh } = await db
    .from("wa_inbox")
    .upsert({ wa_message_id: msg.id, phone: msg.from }, { onConflict: "wa_message_id", ignoreDuplicates: true })
    .select("wa_message_id");
  if (!fresh?.length) return;

  let found: unknown;
  if (forwardMode) {
    // פקודות של המנהל: "#1003" מעביר את ההודעות הבאות להזמנה 1003, "חדש" פותח הזמנה חדשה
    const text = msg.type === "text" ? (msg.text?.body ?? "").trim() : "";
    const target = text.match(/^#?\s*(\d{3,9})$/)?.[1];
    const isNew = /^(חדש|חדשה|הזמנה חדשה|\+)$/.test(text);
    const contact = msg.type === "contacts" ? msg.contacts?.[0] : undefined;
    const phone = contact?.phones?.[0];
    const res = await db
      .rpc("wa_forward_order_for", {
        p_manager: msg.from,
        p_message_id: msg.id,
        p_contact_phone: phone ? waNumber(phone.wa_id || phone.phone || "") : "",
        p_contact_name: contact?.name?.formatted_name ?? "",
        p_gap_minutes: FORWARD_GAP_MIN,
        p_target: target ? Number(target) : null,
        p_new: isNew,
      })
      .single();
    if (res.error) throw res.error;
    if (target || isNew) {
      const id = (res.data as { order_id: number | null }).order_id;
      const { data: o } = id ? await db.from("orders").select("title,client_name").eq("id", id).single() : { data: null };
      const reply = !id
        ? `לא מצאתי הזמנה פתוחה #${target}. ההודעות הבאות ייכנסו להזמנה הנוכחית.`
        : `${isNew ? "נפתחה הזמנה" : "עברתי להזמנה"} #${id}${o && !isNew ? ` · ${o.title}${o.client_name ? ` · ${o.client_name}` : ""}` : ""}. מה שתעביר עכשיו ייכנס אליה.`;
      await sendText(phoneNumberId, msg.from, reply).catch((e) => console.error("reply failed", e));
      return;
    }
    found = res.data;
  } else {
    const res = await db.rpc("wa_order_for", { p_phone: msg.from, p_name: name }).single();
    if (res.error) throw res.error;
    found = res.data;
  }
  const { order_id: orderId } = found as { order_id: number; created: boolean };
  await db.from("wa_inbox").update({ order_id: orderId }).eq("wa_message_id", msg.id);
  await store(orderId, msg);

  // מחכים שהלקוח יסיים לשלוח. רק ההודעה האחרונה ממשיכה.
  await new Promise((r) => setTimeout(r, QUIET_MS));
  const { data: last } = await db
    .from("wa_inbox")
    .select("wa_message_id")
    .eq("order_id", orderId)
    .order("received_at", { ascending: false })
    .limit(1)
    .single();
  if (last?.wa_message_id !== msg.id) return;

  const out = await extract(orderId).catch((e) => {
    console.error("AI failed", e);
    return null;
  });
  await (forwardMode ? answerManager : answerCustomer)(orderId, phoneNumberId, msg.from, out).catch((e) =>
    console.error("reply failed", e)
  );

  const { count } = await db
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId)
    .in("kind", ["wa_new", "wa_message"]);
  await db.from("events").insert({
    order_id: orderId,
    kind: count ? "wa_message" : "wa_new",
    body: textOf(msg).slice(0, 120),
  });
  await db.functions.invoke("notify", { body: {} }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// בקשת פרטים מהלקוח, דרך המנהל: נשלחת למנהל בוואטסאפ, והוא מעביר ללקוח. הטוקן של וואטסאפ נשאר כאן בשרת.
// ---------------------------------------------------------------------------

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** מי שולח: משתמש מחובר שמחובר לחבר צוות פעיל */
async function caller(req: Request): Promise<{ id: string; role: string } | null> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: device } = await db.from("member_devices").select("member_id").eq("auth_uid", data.user.id).maybeSingle();
  if (!device) return null;
  const { data: member } = await db.from("members").select("id,role,active").eq("id", device.member_id).maybeSingle();
  return member?.active ? { id: member.id, role: member.role } : null;
}

async function sendFromApp(req: Request): Promise<Response> {
  const who = await caller(req);
  if (!who) return reply(401, { error: "צריך להתחבר מחדש לאפליקציה" });
  if (who.role !== "designer" && who.role !== "manager") return reply(403, { error: "אין הרשאה לשלוח" });

  let input: { order_id?: unknown; kind?: unknown; text?: unknown; asked?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "בקשה לא תקינה" });
  }
  const orderId = Number(input.order_id);
  const kind = input.kind === "design" ? "design" : "ask";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const asked = Array.isArray(input.asked) ? input.asked.filter((a): a is string => typeof a === "string").slice(0, 10) : [];
  if (!Number.isInteger(orderId)) return reply(400, { error: "בקשה לא תקינה" });
  if (kind === "ask" && !text) return reply(400, { error: "חסר טקסט להודעה" });
  if (text.length > 4000) return reply(400, { error: "ההודעה ארוכה מדי" });

  const { data: order } = await db
    .from("orders")
    .select("id,title,client_name,wa_forwarded_by,wa_replies")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return reply(404, { error: "הזמנה לא נמצאה" });
  // המנהל שהעביר את ההזמנה, או המנהל הראשון ב-WHATSAPP_MANAGERS
  const to = order.wa_forwarded_by || managers()[0];
  if (!to) return reply(500, { error: "לא הוגדר מספר וואטסאפ של המנהל (WHATSAPP_MANAGERS)" });
  const numberId = await businessNumberId();
  if (!env("WHATSAPP_TOKEN") || !numberId) return reply(500, { error: "שליחה בוואטסאפ עוד לא הוגדרה בשרת" });

  const head = [`הזמנה #${orderId}`, order.title, order.client_name].filter(Boolean).join(" · ");
  try {
    if (kind === "design") {
      // העיצוב האחרון שהועלה להזמנה
      const { data: draft } = await db
        .from("messages")
        .select("file_path,file_name,mime")
        .eq("order_id", orderId)
        .eq("kind", "draft")
        .not("file_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!draft) return reply(400, { error: "אין עיצוב בהזמנה" });
      const { data: signed, error } = await db.storage.from("files").createSignedUrl(draft.file_path, 7 * 86400);
      if (error || !signed) throw error ?? new Error("signed url failed");
      const caption = `✅ העיצוב מוכן\n${head}\nלאישור: ${appLink(orderId)}`;
      await sendFile(numberId, to, signed.signedUrl, draft.mime ?? "", caption, draft.file_name ?? "design");
    } else {
      await sendText(numberId, to, `${head}\nהגרפיקאי מבקש מהלקוח:\n${text}\n\nכשהלקוח עונה, כתוב #${orderId} והעבר את התשובה`);
    }
  } catch (e) {
    console.error("send to manager failed", orderId, e);
    // 131047: עברו יותר מ-24 שעות מההודעה האחרונה של המנהל למספר העסקי
    const outside = /131047/.test(String(e));
    return reply(502, {
      error: outside
        ? "וואטסאפ לא מאפשר לשלוח: המנהל לא כתב למספר העסקי ב-24 השעות האחרונות"
        : "השליחה בוואטסאפ נכשלה. נסו שוב",
    });
  }

  if (kind === "design") {
    await db.from("messages").insert({ order_id: orderId, kind: "system", body: "העיצוב נשלח למנהל בוואטסאפ" });
    return reply(200, { ok: true });
  }
  // שהבוט לא ישאל שוב על מה שכבר ביקשנו
  if (asked.length) {
    const sent = (order.wa_replies ?? {}) as Replies;
    await db
      .from("orders")
      .update({ wa_replies: { ...sent, asked: [...new Set([...(sent.asked ?? []), ...asked])] } })
      .eq("id", orderId);
  }
  await db.from("messages").insert({ order_id: orderId, kind: "system", body: `נשלח למנהל להעברה ללקוח: ${text}` });
  return reply(200, { ok: true });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (url.pathname.endsWith("/send")) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return reply(405, { error: "method not allowed" });
    return sendFromApp(req).catch((e) => {
      console.error("send failed", e);
      return reply(500, { error: "שגיאה בשרת" });
    });
  }

  if (req.method === "GET") {
    const token = env("WHATSAPP_VERIFY_TOKEN");
    if (token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    console.error("bad signature");
    return new Response("bad signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  // Meta מצפה לתשובה מהירה. העבודה ממשיכה ברקע.
  const work = Promise.all(
    incoming(payload).map((i) => handle(i).catch((e) => console.error("whatsapp message failed", i.msg.id, e))),
  );
  EdgeRuntime.waitUntil(work);
  return new Response("ok", { status: 200 });
});
