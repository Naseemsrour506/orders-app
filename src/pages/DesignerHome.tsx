import { byPriority, OrderCard } from "../components/OrderCard";
import { PushButton } from "../components/PushButton";
import { Bar, Empty, ErrorLine } from "../components/ui";
import { useMe } from "../lib/auth";
import { loadOrders } from "../lib/data";
import { useLive } from "../lib/hooks";

export function DesignerHome() {
  const me = useMe();
  const { data, error } = useLive(() => loadOrders(14), ["orders"]);
  const orders = data ?? [];
  const mine = orders.filter((o) => o.status === "design" || o.status === "fix").sort(byPriority);
  const waiting = orders.filter((o) => o.status === "review");
  const approved = orders.filter((o) => o.status === "approved" || o.status === "done");

  return (
    <div className="screen">
      <Bar title="העבודות שלי" sub={me.name} avatar="ג" right={<PushButton />} />
      <div className="scroll">
        <ErrorLine error={error} />
        {!data && !error && <Empty>טוען…</Empty>}
        {data && (
          <>
            <div className="sec">
              הכדור אצלך <span className="count">{mine.length}</span>
            </div>
            {mine.length ? mine.map((o) => <OrderCard key={o.id} o={o} />) : <Empty>אין עבודות שמחכות לך 🎉</Empty>}
            {waiting.length > 0 && <div className="sec">ממתין לאישור המנהל</div>}
            {waiting.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
            {approved.length > 0 && <div className="sec">אושרו לאחרונה</div>}
            {approved.map((o) => (
              <OrderCard key={o.id} o={o} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
