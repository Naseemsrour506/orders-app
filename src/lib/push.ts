import { supabase } from "./supabase";

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<"unsupported" | "denied" | "on" | "off"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** מבקש הרשאה ורושם את הטלפון לקבלת התראות. */
export async function enablePush(memberId: string): Promise<void> {
  if (!pushSupported()) throw new Error("הטלפון הזה לא תומך בהתראות. באייפון צריך קודם להוסיף למסך הבית");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("ההתראות חסומות. אפשר לאשר אותן בהגדרות האתר בדפדפן");
  const { data, error } = await supabase.functions.invoke("notify", { body: { op: "vapid" } });
  if (error || !data?.publicKey) throw new Error("לא הצלחתי להפעיל התראות. נסו שוב בעוד רגע");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) });
  }
  const json = sub.toJSON();
  const { error: e2 } = await supabase.from("push_subscriptions").upsert({
    endpoint: json.endpoint,
    member_id: memberId,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
  });
  if (e2) throw new Error(e2.message);
}
