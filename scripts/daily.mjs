// משימה יומית (רצה מ-GitHub Actions):
// 1. מוחקת קבצים סופיים 6 חודשים אחרי "בוצע". התמונות והשיחה נשארים.
// 2. מייצאת גיבוי של כל הנתונים לקובץ JSON (נשמר ב-GitHub ל-90 יום).
// 3. שולחת סיכום בוקר לצוותי השטח (ראשון עד חמישי).
// השימוש היומי גם שומר על הפרויקט החינמי של Supabase ער.
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("חסרים SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const KEEP_DAYS = 182;

async function cleanupFinalFiles() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000).toISOString();
  const { data: old, error } = await db.from("orders").select("id").eq("status", "done").lt("done_at", cutoff);
  if (error) throw error;
  const ids = old.map((o) => o.id);
  let removed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data: msgs, error: e2 } = await db
      .from("messages")
      .select("id,file_path")
      .in("order_id", ids.slice(i, i + 200))
      .eq("kind", "final")
      .is("file_deleted_at", null)
      .not("file_path", "is", null);
    if (e2) throw e2;
    for (let j = 0; j < msgs.length; j += 100) {
      const batch = msgs.slice(j, j + 100);
      const { error: e3 } = await db.storage.from("files").remove(batch.map((m) => m.file_path));
      if (e3) throw e3;
      await db
        .from("messages")
        .update({ file_deleted_at: new Date().toISOString() })
        .in("id", batch.map((m) => m.id));
      removed += batch.length;
    }
  }
  console.log(`נמחקו ${removed} קבצים סופיים ישנים`);
}

async function backup() {
  const tables = ["teams", "members", "orders", "messages", "push_subscriptions"];
  const out = { exported_at: new Date().toISOString() };
  for (const t of tables) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select("*").range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    out[t] = rows;
  }
  await mkdir("backup", { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  await writeFile(`backup/backup-${day}.json`, JSON.stringify(out));
  console.log(`גיבוי: ${out.orders.length} הזמנות, ${out.messages.length} הודעות`);
}

async function oldEvents() {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
  await db.from("events").delete().lt("created_at", cutoff);
}

async function morning() {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date());
  if (day === "Fri" || day === "Sat") return;
  const { error } = await db.functions.invoke("notify", { body: { op: "morning" } });
  if (error) console.error("סיכום בוקר נכשל:", error.message);
  else console.log("סיכום בוקר נשלח");
}

let failed = false;
for (const step of [cleanupFinalFiles, backup, oldEvents, morning]) {
  try {
    await step();
  } catch (e) {
    failed = true;
    console.error(`${step.name} נכשל:`, e);
  }
}
process.exit(failed ? 1 : 0);
