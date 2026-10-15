import { useRef, useState } from "react";
import { kickNotify, postFile, postText } from "../lib/api";
import type { MessageKind } from "../lib/types";
import { useToast } from "./ui";

/** שורת כתיבה: טקסט, צירוף קבצים והקלטת קול */
export function Composer({
  orderId,
  authorId,
  placeholder,
  onSent,
}: {
  orderId: number;
  authorId: string;
  placeholder: string;
  onSent?: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);

  const done = () => {
    kickNotify();
    onSent?.();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await postText(orderId, authorId, v);
      setText("");
      done();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const attach = async (files: FileList | null, kind?: MessageKind) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await postFile(orderId, authorId, f, kind);
      done();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startRec = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("הטלפון לא תומך בהקלטה מהאפליקציה");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      cancelled.current = false;
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timer.current);
        setRec(null);
        if (cancelled.current || !chunks.length) return;
        const mime = r.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const file = new File(chunks, `הקלטה.${ext}`, { type: mime.split(";")[0] });
        setBusy(true);
        try {
          await postFile(orderId, authorId, file, "audio");
          done();
        } catch (err) {
          toast((err as Error).message);
        } finally {
          setBusy(false);
        }
      };
      r.start();
      setRec(r);
      setSecs(0);
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      toast("צריך לאשר גישה למיקרופון");
    }
  };

  const stopRec = (cancel = false) => {
    cancelled.current = cancel;
    rec?.stop();
  };

  if (rec) {
    return (
      <div className="compose recording">
        <span className="rec-dot" aria-hidden />
        <span className="rec-time">
          מקליט {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </span>
        <button type="button" className="cta ghost small" onClick={() => stopRec(true)}>
          ביטול
        </button>
        <button type="button" className="cta small" onClick={() => stopRec(false)}>
          שלח
        </button>
      </div>
    );
  }

  return (
    <form className="compose" onSubmit={send}>
      <button type="button" className="icon-btn" aria-label="צירוף קובץ" onClick={() => fileRef.current?.click()} disabled={busy}>
        📎
      </button>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
      <input
        className="compose-in"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={busy ? "שולח…" : placeholder}
        autoComplete="off"
        enterKeyHint="send"
      />
      {text.trim() ? (
        <button className="send" disabled={busy}>
          שלח
        </button>
      ) : (
        <button type="button" className="icon-btn mic" aria-label="הקלטת קול" onClick={startRec} disabled={busy}>
          🎤
        </button>
      )}
    </form>
  );
}
