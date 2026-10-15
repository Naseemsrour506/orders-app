import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STATUS_LABEL, type Status } from "../lib/types";

const ToastCtx = createContext<(t: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((t: string) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const CHIP: Record<Status, string> = {
  new: "",
  design: "",
  review: "w",
  fix: "w",
  approved: "g",
  done: "g",
};

export function StatusChip({ status }: { status: Status }) {
  return <span className={`chip ${CHIP[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Bar({
  title,
  sub,
  back,
  avatar,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: string | true;
  avatar?: string;
  right?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="bar">
      {back ? (
        <button
          className="icon-btn"
          aria-label="חזרה"
          onClick={() => (back === true ? (history.length > 1 ? nav(-1) : nav("/")) : nav(back))}
        >
          →
        </button>
      ) : avatar ? (
        <div className="avatar">{avatar}</div>
      ) : null}
      <div className="bar-text">
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="shade" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="סגירה" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <div className="error">{error}</div> : null;
}

export function Tabs({ items }: { items: { to: string; label: string; active: boolean }[] }) {
  return (
    <nav className="tabs">
      {items.map((i) => (
        <Link key={i.to} to={i.to} className={i.active ? "on" : ""}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

/** כפתור שמראה "רגע..." בזמן פעולה ומציג שגיאה כהודעה קופצת */
export function useBusy() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn: () => Promise<unknown>, ok?: string) => {
      if (busy) return false;
      setBusy(true);
      try {
        await fn();
        if (ok) toast(ok);
        return true;
      } catch (e) {
        toast((e as Error).message || "שגיאה");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, toast],
  );
  return { busy, run };
}
