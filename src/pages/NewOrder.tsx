import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, useBusy } from "../components/ui";
import { kickNotify, postFile, postText, rpc } from "../lib/api";
import { useMe } from "../lib/auth";
import { isImage } from "../lib/image";

/** כותרת קצרה מתוך הטקסט ששותף */
function guessTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const sentence = line.split(/(?<=[?.!])\s/)[0];
  return sentence.length > 50 ? sentence.slice(0, 48) + "…" : sentence;
}

/** טלפון ראשון שמופיע בטקסט */
function guessPhone(text: string): string {
  return text.match(/(?:\+972|0)[\s-]?5\d(?:[\s-]?\d){7}/)?.[0]?.replace(/[\s-]/g, "") ?? "";
}

export function NewOrderForm({
  initialText = "",
  initialFiles = [],
  onCreated,
}: {
  initialText?: string;
  initialFiles?: File[];
  onCreated?: (id: number) => void;
}) {
  const me = useMe();
  const nav = useNavigate();
  const { busy, run } = useBusy();
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [f, setF] = useState({
    title: guessTitle(initialText),
    client_name: "",
    client_phone: guessPhone(initialText),
    address: "",
    design_due: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const create = (send: boolean) =>
    run(async () => {
      const id = await rpc<number>("create_order", {
        p_title: f.title,
        p_client_name: f.client_name,
        p_client_phone: f.client_phone,
        p_address: f.address,
        p_design_due: f.design_due || null,
      });
      if (text.trim()) await postText(id, me.id, text.trim());
      for (const file of files) await postFile(id, me.id, file);
      if (send) await rpc("send_to_designer", { p_order_id: id });
      kickNotify();
      onCreated?.(id);
      nav(`/order/${id}`, { replace: true });
    }, send ? "ההזמנה נפתחה ונשלחה לגרפיקאי" : "ההזמנה נפתחה");

  return (
    <div className="scroll form">
      <label>
        מה מזמינים
        <input className="field" value={f.title} onChange={set("title")} placeholder="למשל: שלט חזית 2×0.6 מ׳" />
      </label>
      <div className="row gap">
        <label className="grow">
          לקוח
          <input className="field" value={f.client_name} onChange={set("client_name")} placeholder="שם או עסק" />
        </label>
        <label className="grow">
          טלפון
          <input className="field" type="tel" value={f.client_phone} onChange={set("client_phone")} />
        </label>
      </div>
      <label>
        כתובת לביצוע
        <input className="field" value={f.address} onChange={set("address")} placeholder="לא חובה עכשיו" />
      </label>
      <label>
        עיצוב עד תאריך
        <input className="field" type="date" value={f.design_due} onChange={set("design_due")} />
      </label>
      <label>
        תיאור מהלקוח
        <textarea className="field" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="files">
        {files.map((file, i) => (
          <div key={i} className="file-chip">
            {isImage(file.type) ? <img src={URL.createObjectURL(file)} alt="" /> : <span>📄</span>}
            <span className="file-name">{file.name}</span>
            <button className="icon-btn" aria-label="הסרה" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button className="drop" onClick={() => fileRef.current?.click()}>
          + תמונות או קבצים
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="dock sticky">
        <button className="cta" disabled={busy} onClick={() => create(true)}>
          {busy ? "שומר…" : "פתח ושלח לגרפיקאי"}
        </button>
        <button className="cta ghost" disabled={busy} onClick={() => create(false)}>
          רק פתח
        </button>
      </div>
    </div>
  );
}

export function NewOrder() {
  return (
    <div className="screen">
      <Bar title="הזמנה חדשה" back="/" />
      <NewOrderForm />
    </div>
  );
}
