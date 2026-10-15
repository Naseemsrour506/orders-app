// "בוצע" בלי קליטה: נשמר בטלפון ונשלח כשהקליטה חוזרת.
import { get, set } from "idb-keyval";
import { rpc, uploadFile, kickNotify } from "./api";
import { shrinkImage } from "./image";

interface PendingDone {
  orderId: number;
  photo: Blob | null;
  photoName: string;
  note: string;
  at: number;
}

const KEY = "pending-done";

export async function pending(): Promise<PendingDone[]> {
  try {
    return ((await get(KEY)) as PendingDone[] | undefined) ?? [];
  } catch {
    return [];
  }
}

async function save(list: PendingDone[]) {
  await set(KEY, list);
}

async function sendOne(p: PendingDone) {
  let path: string | null = null;
  if (p.photo) path = await uploadFile(p.orderId, p.photo, p.photoName, "done");
  await rpc("field_mark_done", { p_order_id: p.orderId, p_photo_path: path, p_note: p.note });
}

/** מסמן בוצע. אם אין קליטה, שומר בתור ומחזיר false. */
export async function markDone(orderId: number, photo: File | null, note: string): Promise<boolean> {
  const small = photo ? await shrinkImage(photo) : null;
  const item: PendingDone = { orderId, photo: small, photoName: small?.name ?? "done.jpg", note, at: Date.now() };
  try {
    await sendOne(item);
    kickNotify();
    return true;
  } catch (e) {
    const offline = !navigator.onLine || /fetch|network|אין חיבור/i.test(String((e as Error).message));
    if (!offline) throw e;
    await save([...(await pending()).filter((x) => x.orderId !== orderId), item]);
    return false;
  }
}

let flushing = false;

/** שולח את כל מה שממתין. מחזיר כמה נשלחו. */
export async function flushPending(): Promise<number> {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const list = await pending();
    const left: PendingDone[] = [];
    for (const p of list) {
      try {
        await sendOne(p);
        sent++;
      } catch {
        left.push(p);
      }
    }
    await save(left);
    if (sent) kickNotify();
  } finally {
    flushing = false;
  }
  return sent;
}
