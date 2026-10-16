import { BUCKET, supabase } from "./supabase";
import { shrinkImage, isImage, isAudio } from "./image";
import type { MessageKind } from "./types";

export function errText(e: unknown): string {
  if (!e) return "שגיאה";
  if (typeof e === "string") return e;
  const m = (e as { message?: string }).message;
  if (m && /Failed to fetch|NetworkError|Load failed/i.test(m)) return "אין חיבור לאינטרנט";
  return m || "שגיאה";
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function safeName(name: string): string {
  const ext = (name.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

export async function uploadFile(orderId: number, file: Blob, name: string, sub = ""): Promise<string> {
  const path = `orders/${orderId}/${sub ? sub + "/" : ""}${safeName(name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

const urlCache = new Map<string, { url: string; at: number }>();

export async function signedUrl(path: string, download?: string): Promise<string> {
  const key = path + (download ?? "");
  const hit = urlCache.get(key);
  if (hit && Date.now() - hit.at < 50 * 60_000) return hit.url;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error) throw new Error(error.message);
  urlCache.set(key, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}

export function kindForFile(file: File): MessageKind {
  if (isImage(file.type)) return "image";
  if (isAudio(file.type)) return "audio";
  return "file";
}

/** מעלה קובץ ומוסיף אותו כהודעה בכרטיס. kind=draft/final נקבע על ידי הגרפיקאי. */
export async function postFile(orderId: number, authorId: string, raw: File, kind?: MessageKind, body = "") {
  const k = kind ?? kindForFile(raw);
  // קובץ סופי להדפסה נשמר מקורי; כל השאר מוקטן.
  const file = k === "final" || k === "file" || k === "audio" ? raw : await shrinkImage(raw);
  const path = await uploadFile(orderId, file, file.name || "file");
  const { error } = await supabase.from("messages").insert({
    order_id: orderId,
    author_id: authorId,
    kind: k,
    body,
    file_path: path,
    file_name: file.name || raw.name || "קובץ",
    mime: file.type || raw.type || null,
    size_bytes: file.size,
  });
  if (error) throw new Error(error.message);
}

export async function postText(orderId: number, authorId: string, body: string) {
  const { error } = await supabase.from("messages").insert({ order_id: orderId, author_id: authorId, kind: "text", body });
  if (error) throw new Error(error.message);
}

/** שולח למנהל בוואטסאפ מה לבקש מהלקוח, והמנהל מעביר ללקוח. עובר דרך השרת, שם נמצא הטוקן. */
export function askViaManager(orderId: number, text: string, asked: string[] = []) {
  return sendToManager({ order_id: orderId, kind: "ask", text, asked });
}

/** שולח למנהל בוואטסאפ את העיצוב האחרון שהועלה להזמנה */
export function designToManager(orderId: number) {
  return sendToManager({ order_id: orderId, kind: "design" });
}

async function sendToManager(payload: Record<string, unknown>) {
  const { error } = await supabase.functions.invoke("whatsapp/send", { body: payload });
  if (!error) return;
  const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
  throw new Error(body?.error || "השליחה נכשלה. נסו שוב");
}

/** מבקש מפונקציית ההתראות לשלוח את מה שממתין. לא חוסם ולא נכשל. */
export function kickNotify() {
  supabase.functions.invoke("notify", { body: {} }).catch(() => undefined);
}

export function joinLink(token: string): string {
  return `${location.origin}/join#t=${encodeURIComponent(token)}`;
}

export function waLink(text: string, phone?: string): string {
  const p = (phone ?? "").replace(/\D/g, "").replace(/^0/, "972");
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
}
