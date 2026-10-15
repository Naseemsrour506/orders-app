import { useEffect, useRef, useState } from "react";
import { DownloadLink, FileView } from "../components/FileView";
import { PushButton } from "../components/PushButton";
import { Bar, Empty, ErrorLine, Sheet, useBusy, useToast } from "../components/ui";
import { kickNotify, rpc } from "../lib/api";
import { useMe } from "../lib/auth";
import { fmtDay, fmtLongToday, todayIL } from "../lib/dates";
import { useLive } from "../lib/hooks";
import { flushPending, markDone, pending } from "../lib/offline";
import type { FieldTask } from "../lib/types";

const cacheKey = (team: number | null) => `field-tasks-${team ?? "all"}`;

async function loadTasks(team: number | null): Promise<FieldTask[]> {
  try {
    const list = await rpc<FieldTask[]>("field_tasks", team ? { p_team_id: team } : {});
    try {
      localStorage.setItem(cacheKey(team), JSON.stringify({ day: todayIL(), list }));
    } catch {
      /* אין מקום */
    }
    return list;
  } catch (e) {
    // בלי קליטה: הרשימה האחרונה שנשמרה בטלפון.
    const raw = localStorage.getItem(cacheKey(team));
    if (raw) return JSON.parse(raw).list as FieldTask[];
    throw e;
  }
}

/** הרשימה היומית של צוות שטח. המנהל רואה אותה גם, עם team */
export function FieldList({ team, asManager }: { team: number | null; asManager?: boolean }) {
  const toast = useToast();
  const [queued, setQueued] = useState<number[]>([]);
  const [open, setOpen] = useState<FieldTask | null>(null);
  const [issueFor, setIssueFor] = useState<FieldTask | null>(null);
  const { data, error, reload } = useLive(() => loadTasks(team), ["orders"], [team]);

  const refreshQueued = () => pending().then((p) => setQueued(p.map((x) => x.orderId)));

  useEffect(() => {
    refreshQueued();
    const sync = async () => {
      const n = await flushPending();
      if (n) {
        toast(`נשלחו ${n} סימוני "בוצע" שחיכו לקליטה`);
        reload();
      }
      refreshQueued();
    };
    sync();
    window.addEventListener("online", sync);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        reload();
        sync();
      }
    }, 60_000);
    return () => {
      window.removeEventListener("online", sync);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const list = (data ?? []).map((t) => (queued.includes(t.id) ? { ...t, done: true } : t));
  const todo = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);

  return (
    <>
      <div className="scroll">
        <ErrorLine error={error && !data ? error : null} />
        {!data && !error && <Empty>טוען…</Empty>}
        {data && todo.length === 0 && <Empty>{done.length ? "הכל בוצע להיום 🎉" : "אין עבודות להיום"}</Empty>}
        {todo.map((t) => (
          <TaskRow key={t.id} t={t} onOpen={() => setOpen(t)} />
        ))}
        {done.length > 0 && <div className="sec">בוצעו היום</div>}
        {done.map((t) => (
          <TaskRow key={t.id} t={t} queued={queued.includes(t.id)} onOpen={() => setOpen(t)} />
        ))}
      </div>
      {open && (
        <TaskSheet
          t={list.find((x) => x.id === open.id) ?? open}
          asManager={asManager}
          onClose={() => setOpen(null)}
          onIssue={() => {
            setIssueFor(open);
            setOpen(null);
          }}
          onChanged={() => {
            reload();
            refreshQueued();
          }}
        />
      )}
      {issueFor && <IssueSheet t={issueFor} onClose={() => setIssueFor(null)} />}
    </>
  );
}

function TaskRow({ t, queued, onOpen }: { t: FieldTask; queued?: boolean; onOpen: () => void }) {
  return (
    <button className={`task ${t.carried && !t.done ? "carry" : ""} ${t.done ? "done" : ""}`} onClick={onOpen}>
      <span className={`check ${t.done ? "on" : ""}`} aria-hidden>
        {t.done ? "✓" : ""}
      </span>
      <span className="body">
        <span className="row">
          <span className="tt">{t.title || "ללא כותרת"}</span>
          {t.carried && !t.done && <span className="chip r">{fmtDay(t.scheduled_date) === "אתמול" ? "מאתמול" : `מאתמול · ${fmtDay(t.scheduled_date)}`}</span>}
          {!t.carried && t.urgent && !t.done && <span className="chip w">דחוף</span>}
          {queued && <span className="chip">ממתין לקליטה</span>}
        </span>
        <span className="sub">{[t.client_name, t.address].filter(Boolean).join(" · ")}</span>
        {t.field_notes && <span className="note-line">{t.field_notes}</span>}
        <span className="num">#{t.id}</span>
      </span>
    </button>
  );
}

function TaskSheet({
  t,
  asManager,
  onClose,
  onIssue,
  onChanged,
}: {
  t: FieldTask;
  asManager?: boolean;
  onClose: () => void;
  onIssue: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { busy, run } = useBusy();
  const camRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");

  const finish = async (photo: File | null) => {
    await run(async () => {
      const sent = await markDone(t.id, photo, note.trim());
      toast(sent ? "סומן בוצע ✓" : "נשמר בטלפון, יישלח כשתחזור קליטה");
      onChanged();
      onClose();
    });
  };

  const undo = () =>
    run(async () => {
      await rpc("field_undo_done", { p_order_id: t.id });
      onChanged();
      onClose();
    }, "הסימון בוטל");

  return (
    <Sheet title={`#${t.id} ${t.title}`} onClose={onClose}>
      <div className="kv">
        {t.client_name && (
          <div>
            <b>לקוח:</b> {t.client_name}
            {t.client_phone && (
              <>
                {" · "}
                <a href={`tel:${t.client_phone}`}>{t.client_phone}</a>
              </>
            )}
          </div>
        )}
        {t.address && (
          <div>
            <b>כתובת:</b> {t.address}
          </div>
        )}
        {t.field_notes && (
          <div>
            <b>הערות:</b> {t.field_notes}
          </div>
        )}
        {t.field_issue && <div className="warn-line">⚠ {t.field_issue}</div>}
      </div>
      {t.final_file_path ? (
        <DownloadLink path={t.final_file_path} name={t.final_file_name} label={`קובץ סופי: ${t.final_file_name ?? ""}`} />
      ) : (
        <div className="sub">אין קובץ סופי בכרטיס</div>
      )}
      {t.done ? (
        <>
          {t.done_photo_path && <FileView path={t.done_photo_path} name="תמונת סיום" mime="image/jpeg" />}
          <button className="cta ghost" onClick={undo} disabled={busy}>
            בטל סימון "בוצע"
          </button>
        </>
      ) : (
        <>
          <input className="field" placeholder="הערה (לא חובה)" value={note} onChange={(e) => setNote(e.target.value)} />
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => e.target.files?.[0] && finish(e.target.files[0])}
          />
          <button className="cta big" onClick={() => camRef.current?.click()} disabled={busy}>
            📷 בוצע + תמונת סיום
          </button>
          <div className="row gap">
            <button className="cta ghost" onClick={() => finish(null)} disabled={busy}>
              בוצע בלי תמונה
            </button>
            {!asManager && (
              <button className="cta warn" onClick={onIssue} disabled={busy}>
                נתקעתי
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

function IssueSheet({ t, onClose }: { t: FieldTask; onClose: () => void }) {
  const [text, setText] = useState("");
  const { busy, run } = useBusy();
  const send = () =>
    run(async () => {
      await rpc("field_report_issue", { p_order_id: t.id, p_note: text });
      kickNotify();
      onClose();
    }, "ההערה נשלחה למנהל");
  return (
    <Sheet title="מה קרה?" onClose={onClose}>
      <textarea className="field" rows={3} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: הלקוח לא בבית, חסר בורג, המידות לא מתאימות" />
      <button className="cta" onClick={send} disabled={busy || !text.trim()}>
        שלח למנהל
      </button>
    </Sheet>
  );
}

export function FieldHome() {
  const me = useMe();
  return (
    <div className="screen">
      <Bar title="המשימות שלי היום" sub={`${me.name} · ${fmtLongToday()}`} avatar="ש" right={<PushButton />} />
      <FieldList team={me.team_id} />
    </div>
  );
}
