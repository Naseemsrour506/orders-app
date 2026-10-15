import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Composer } from "../components/Composer";
import { FileView } from "../components/FileView";
import { isCarried, isLate } from "../components/OrderCard";
import { Bar, Empty, ErrorLine, Sheet, StatusChip, useBusy, useToast } from "../components/ui";
import { kickNotify, postFile, rpc, signedUrl, waLink } from "../lib/api";
import { useMe } from "../lib/auth";
import { loadMembers, loadMessages, loadOrder, loadTeams } from "../lib/data";
import { fmtDay, fmtTime, nextWorkday, todayIL } from "../lib/dates";
import { useLive } from "../lib/hooks";
import { supabase } from "../lib/supabase";
import type { Me, Member, Message, Order, Team } from "../lib/types";
import { ROLE_LABEL } from "../lib/types";

export function OrderPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const { data, error, reload } = useLive(
    async () => {
      const [order, messages, teams, members] = await Promise.all([
        loadOrder(id),
        loadMessages(id),
        loadTeams(),
        loadMembers().catch(() => [] as Member[]),
      ]);
      return { order, messages, teams, members };
    },
    ["orders", "messages"],
    [id],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  if (error && !data) {
    return (
      <div className="screen">
        <Bar title={`#${id}`} back />
        <ErrorLine error={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="screen">
        <Bar title={`#${id}`} back />
        <Empty>טוען…</Empty>
      </div>
    );
  }
  const { order, messages, teams, members } = data;
  if (!order) {
    return (
      <div className="screen">
        <Bar title={`#${id}`} back />
        <Empty>ההזמנה לא נמצאה, או שאין לך גישה אליה</Empty>
      </div>
    );
  }

  return (
    <div className="screen">
      <Bar
        back
        title={`#${order.id} ${order.title || "ללא כותרת"}`}
        sub={order.client_name || undefined}
        right={<StatusChip status={order.status} />}
      />
      <Details order={order} teams={teams} me={me} onChanged={reload} />
      <div className="scroll thread" ref={scrollRef}>
        {messages.length === 0 && <Empty>אין עדיין הודעות בכרטיס</Empty>}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} me={me} members={members} order={order} />
        ))}
      </div>
      <Actions order={order} teams={teams} me={me} onChanged={reload} />
      <Composer
        orderId={order.id}
        authorId={me.id}
        placeholder={me.role === "designer" ? "הודעה למנהל…" : "הודעה לגרפיקאי…"}
        onSent={reload}
      />
    </div>
  );
}

function Details({ order, teams, me, onChanged }: { order: Order; teams: Team[]; me: Me; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const team = teams.find((t) => t.id === order.team_id);
  const parts = [
    order.client_phone && (
      <a key="p" href={`tel:${order.client_phone}`}>
        {order.client_phone}
      </a>
    ),
    order.address && <span key="a">{order.address}</span>,
    order.design_due && (order.status === "design" || order.status === "fix" || order.status === "new") && (
      <span key="d" className={isLate(order) ? "late" : ""}>
        עיצוב עד {fmtDay(order.design_due)}
      </span>
    ),
    order.status === "approved" && order.scheduled_date && (
      <span key="s" className={isCarried(order) ? "late" : ""}>
        {team?.name} · {fmtDay(order.scheduled_date)}
        {isCarried(order) ? " (מאתמול)" : ""}
      </span>
    ),
    order.urgent && order.status !== "done" && (
      <span key="u" className="chip w">
        דחוף
      </span>
    ),
  ].filter(Boolean);

  return (
    <>
      <div className="details">
        <div className="details-row">{parts.length ? parts : <span className="sub">אין פרטים נוספים</span>}</div>
        {me.role === "manager" && (
          <button className="link-btn" onClick={() => setEdit(true)}>
            עריכה
          </button>
        )}
      </div>
      {order.field_issue && order.status === "approved" && <div className="warn-line pad">⚠ מהשטח: {order.field_issue}</div>}
      {edit && <EditSheet order={order} onClose={() => setEdit(false)} onSaved={onChanged} />}
    </>
  );
}

function EditSheet({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: order.title,
    client_name: order.client_name,
    client_phone: order.client_phone,
    address: order.address,
    design_due: order.design_due ?? "",
    field_notes: order.field_notes,
  });
  const { busy, run } = useBusy();
  const save = () =>
    run(async () => {
      const { error } = await supabase
        .from("orders")
        .update({ ...f, design_due: f.design_due || null })
        .eq("id", order.id);
      if (error) throw new Error(error.message);
      onSaved();
      onClose();
    }, "נשמר");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="פרטי ההזמנה" onClose={onClose}>
      <label>
        מה מזמינים
        <input className="field" value={f.title} onChange={set("title")} />
      </label>
      <label>
        לקוח
        <input className="field" value={f.client_name} onChange={set("client_name")} />
      </label>
      <label>
        טלפון
        <input className="field" type="tel" value={f.client_phone} onChange={set("client_phone")} />
      </label>
      <label>
        כתובת לביצוע
        <input className="field" value={f.address} onChange={set("address")} />
      </label>
      <label>
        עיצוב עד
        <input className="field" type="date" value={f.design_due} onChange={set("design_due")} />
      </label>
      <label>
        הערות לצוות השטח
        <textarea className="field" rows={2} value={f.field_notes} onChange={set("field_notes")} />
      </label>
      <button className="cta" onClick={save} disabled={busy}>
        שמירה
      </button>
    </Sheet>
  );
}

function authorName(m: Message, members: Member[], me: Me): string {
  if (m.author_id === me.id) return "אני";
  const a = members.find((x) => x.id === m.author_id);
  if (a) return a.role === "field" ? a.name : `${a.name} · ${ROLE_LABEL[a.role]}`;
  return "";
}

function Bubble({ m, me, members, order }: { m: Message; me: Me; members: Member[]; order: Order }) {
  if (m.kind === "system") {
    return (
      <div className="sys">
        {m.body} · {fmtTime(m.created_at)}
      </div>
    );
  }
  const mine = m.author_id === me.id;
  const label = m.kind === "draft" ? "טיוטה" : m.kind === "final" ? "קובץ סופי להדפסה" : null;
  return (
    <div className={`pp ${mine ? "me" : "them"} ${m.kind}`}>
      <span className="who">
        {authorName(m, members, me)}
        {label && <b className="kind-tag">{label}</b>}
      </span>
      <div className="b">
        {m.file_path && <FileView path={m.file_path} name={m.file_name} mime={m.mime} deleted={!!m.file_deleted_at} />}
        {m.body && <div className="text">{m.body}</div>}
        <time>{fmtTime(m.created_at)}</time>
      </div>
      {m.kind === "draft" && me.role === "manager" && m.file_path && <SendToClient m={m} order={order} />}
    </div>
  );
}

/** שולח את הטיוטה ללקוח בווטסאפ בלחיצה אחת */
function SendToClient({ m, order }: { m: Message; order: Order }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const text = `היי${order.client_name ? " " + order.client_name : ""}, מצורפת טיוטה להזמנה #${order.id}. מאשר?`;
  const go = async () => {
    setBusy(true);
    try {
      const url = await signedUrl(m.file_path!);
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], m.file_name || "draft.jpg", { type: m.mime || blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        window.open(waLink(`${text}\n${url}`, order.client_phone), "_blank");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("לא הצלחתי לשתף. נסו שוב");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="link-btn wa" onClick={go} disabled={busy}>
      שלח ללקוח בווטסאפ
    </button>
  );
}

function Actions({ order, teams, me, onChanged }: { order: Order; teams: Team[]; me: Me; onChanged: () => void }) {
  const [sheet, setSheet] = useState<null | "approve" | "fix" | "move">(null);
  const { busy, run } = useBusy();
  const draftRef = useRef<HTMLInputElement>(null);
  const finalRef = useRef<HTMLInputElement>(null);

  const act = (fn: string, args: Record<string, unknown>, ok: string) =>
    run(async () => {
      await rpc(fn, args);
      kickNotify();
      onChanged();
    }, ok);

  const update = (patch: Partial<Order>, ok: string) =>
    run(async () => {
      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw new Error(error.message);
      onChanged();
    }, ok);

  if (me.role === "designer") {
    const upload = (kind: "draft" | "final") => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      await run(async () => {
        for (const f of Array.from(files)) await postFile(order.id, me.id, f, kind);
        kickNotify();
        onChanged();
      }, kind === "draft" ? "הטיוטה נשלחה למנהל" : "הקובץ הסופי נשמר בכרטיס");
      e.target.value = "";
    };
    if (order.status === "done") return null;
    return (
      <div className="dock">
        <input ref={draftRef} type="file" accept="image/*,application/pdf" hidden onChange={upload("draft")} />
        <input ref={finalRef} type="file" hidden onChange={upload("final")} />
        {(order.status === "design" || order.status === "fix" || order.status === "review") && (
          <button className="cta" disabled={busy} onClick={() => draftRef.current?.click()}>
            {order.status === "review" ? "טיוטה נוספת" : order.status === "fix" ? "שלח טיוטה מתוקנת" : "שלח טיוטה"}
          </button>
        )}
        <button className="cta ghost" disabled={busy} onClick={() => finalRef.current?.click()}>
          {order.final_file_path ? "החלף קובץ סופי" : "העלה קובץ סופי"}
        </button>
      </div>
    );
  }

  if (me.role !== "manager") return null;

  return (
    <>
      <div className="dock">
        {order.status === "new" && (
          <>
            <button className="cta" disabled={busy} onClick={() => act("send_to_designer", { p_order_id: order.id }, "נשלח לגרפיקאי")}>
              שלח לגרפיקאי
            </button>
            <button className="cta ghost" disabled={busy} onClick={() => setSheet("approve")}>
              ישר לביצוע
            </button>
          </>
        )}
        {order.status === "review" && (
          <>
            <button className="cta" disabled={busy} onClick={() => setSheet("approve")}>
              אשר לביצוע
            </button>
            <button className="cta warn" disabled={busy} onClick={() => setSheet("fix")}>
              החזר לתיקון
            </button>
          </>
        )}
        {(order.status === "design" || order.status === "fix") && (
          <button className="cta ghost" disabled={busy} onClick={() => setSheet("approve")}>
            אשר לביצוע בלי טיוטה
          </button>
        )}
        {order.status === "approved" && (
          <>
            <button className="cta ghost" disabled={busy} onClick={() => setSheet("move")}>
              תאריך / צוות
            </button>
            <button
              className={`cta ${order.urgent ? "warn" : "ghost"}`}
              disabled={busy}
              onClick={() => update({ urgent: !order.urgent }, order.urgent ? "הוסר הסימון דחוף" : "סומן דחוף")}
            >
              {order.urgent ? "בטל דחוף" : "דחוף"}
            </button>
            <button className="cta ghost" disabled={busy} onClick={() => update({ bumped_at: new Date().toISOString() }, "הועלה לראש הרשימה")}>
              לראש הרשימה
            </button>
          </>
        )}
        {order.status === "done" && (
          <button className="cta ghost" disabled={busy} onClick={() => act("reopen_order", { p_order_id: order.id }, "נפתח מחדש")}>
            פתח מחדש
          </button>
        )}
      </div>
      {sheet === "approve" && <ApproveSheet order={order} teams={teams} onClose={() => setSheet(null)} onDone={onChanged} />}
      {sheet === "move" && <ApproveSheet order={order} teams={teams} move onClose={() => setSheet(null)} onDone={onChanged} />}
      {sheet === "fix" && <FixSheet order={order} onClose={() => setSheet(null)} onDone={onChanged} />}
    </>
  );
}

function ApproveSheet({
  order,
  teams,
  move,
  onClose,
  onDone,
}: {
  order: Order;
  teams: Team[];
  move?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = todayIL();
  const [team, setTeam] = useState<number>(order.team_id ?? teams[0]?.id ?? 1);
  const [date, setDate] = useState(order.scheduled_date && order.scheduled_date >= today ? order.scheduled_date : today);
  const [address, setAddress] = useState(order.address);
  const [notes, setNotes] = useState(order.field_notes);
  const { busy, run } = useBusy();

  const save = () =>
    run(async () => {
      if (move) {
        await rpc("reschedule_order", { p_order_id: order.id, p_team_id: team, p_scheduled_date: date });
      } else {
        await rpc("approve_order", {
          p_order_id: order.id,
          p_team_id: team,
          p_scheduled_date: date,
          p_address: address,
          p_field_notes: notes,
        });
      }
      kickNotify();
      onDone();
      onClose();
    }, move ? "עודכן" : "אושר ונכנס לרשימת השטח");

  return (
    <Sheet title={move ? "העברה לתאריך או צוות אחר" : "אישור לביצוע"} onClose={onClose}>
      <div className="seg">
        {teams.map((t) => (
          <button key={t.id} className={t.id === team ? "on" : ""} onClick={() => setTeam(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="seg">
        {[today, nextWorkday(today)].map((d) => (
          <button key={d} className={d === date ? "on" : ""} onClick={() => setDate(d)}>
            {fmtDay(d)}
          </button>
        ))}
        <input className="field date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {!move && (
        <>
          <label>
            כתובת
            <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label>
            הערות לצוות
            <textarea className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {!order.final_file_path && <div className="warn-line">אין עדיין קובץ סופי בכרטיס. אפשר לאשר, והגרפיקאי יעלה אותו אחר כך.</div>}
        </>
      )}
      <button className="cta" onClick={save} disabled={busy}>
        {move ? "שמירה" : "אשר לביצוע"}
      </button>
    </Sheet>
  );
}

function FixSheet({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, run } = useBusy();
  const send = () =>
    run(async () => {
      await rpc("return_for_fix", { p_order_id: order.id, p_note: note });
      kickNotify();
      onDone();
      onClose();
    }, "הוחזר לגרפיקאי");
  return (
    <Sheet title="מה לתקן?" onClose={onClose}>
      <textarea
        className="field"
        rows={3}
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="למשל: להגדיל את הלוגו ולהעביר שמאלה"
      />
      <div className="sub">אפשר גם להקליט הודעה קולית בכרטיס אחרי ההחזרה.</div>
      <button className="cta warn" onClick={send} disabled={busy}>
        החזר לתיקון
      </button>
    </Sheet>
  );
}
