import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StatusChip, Bar, Empty, useBusy } from "../components/ui";
import { kickNotify, postFile, postText } from "../lib/api";
import { useMe } from "../lib/auth";
import { loadOrders } from "../lib/data";
import { isImage } from "../lib/image";
import { clearShare, readShare, sharedText, type SharedItem } from "../lib/share";
import type { Order } from "../lib/types";
import { NewOrderForm } from "./NewOrder";

/** מה שנפתח אחרי "שתף" מווטסאפ: הזמנה חדשה או הוספה להזמנה פתוחה */
export function SharePage() {
  const me = useMe();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const id = params.get("id") ?? "";
  const [item, setItem] = useState<SharedItem | null | undefined>(undefined);
  const [mode, setMode] = useState<"choose" | "new" | "existing">("choose");
  const [orders, setOrders] = useState<Order[]>([]);
  const { busy, run } = useBusy();

  useEffect(() => {
    readShare(id).then(setItem).catch(() => setItem(null));
    loadOrders(0)
      .then((o) => setOrders(o.filter((x) => x.status !== "done")))
      .catch(() => undefined);
  }, [id]);

  if (me.role !== "manager") {
    return (
      <div className="screen">
        <Bar title="שיתוף" back="/" />
        <Empty>רק המנהל פותח הזמנות משיתוף.</Empty>
      </div>
    );
  }
  if (item === undefined) {
    return (
      <div className="screen">
        <Bar title="שיתוף" back="/" />
        <Empty>טוען…</Empty>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="screen">
        <Bar title="שיתוף" back="/" />
        <Empty>לא מצאתי את מה ששותף. נסו לשתף שוב מווטסאפ.</Empty>
      </div>
    );
  }

  const text = sharedText(item);

  const addTo = (o: Order) =>
    run(async () => {
      if (text) await postText(o.id, me.id, text);
      for (const f of item.files) await postFile(o.id, me.id, f);
      await clearShare(item.id);
      kickNotify();
      nav(`/order/${o.id}`, { replace: true });
    }, `נוסף להזמנה #${o.id}`);

  if (mode === "new") {
    return (
      <div className="screen">
        <Bar title="הזמנה חדשה מווטסאפ" back={true} />
        <NewOrderForm initialText={text} initialFiles={item.files} onCreated={() => clearShare(item.id)} />
      </div>
    );
  }

  return (
    <div className="screen">
      <Bar title="שיתוף מווטסאפ" sub={`${item.files.length} קבצים${text ? " וטקסט" : ""}`} back="/" />
      <div className="scroll">
        <div className="shared-preview">
          {text && <div className="text">{text}</div>}
          <div className="files">
            {item.files.map((f, i) =>
              isImage(f.type) ? (
                <img key={i} src={URL.createObjectURL(f)} alt="" className="thumb" />
              ) : (
                <span key={i} className="file-chip">
                  📄 {f.name}
                </span>
              ),
            )}
          </div>
        </div>
        {mode === "choose" ? (
          <>
            <button className="cta big" onClick={() => setMode("new")}>
              הזמנה חדשה
            </button>
            <button className="cta ghost big" onClick={() => setMode("existing")} disabled={!orders.length}>
              הוספה להזמנה פתוחה
            </button>
          </>
        ) : (
          <>
            <div className="sec">לאיזו הזמנה להוסיף?</div>
            {orders.map((o) => (
              <button key={o.id} className="card" disabled={busy} onClick={() => addTo(o)}>
                <div className="row">
                  <span className="num">#{o.id}</span>
                  <StatusChip status={o.status} />
                </div>
                <div className="tt">{o.title || "ללא כותרת"}</div>
                <div className="sub">{o.client_name}</div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
