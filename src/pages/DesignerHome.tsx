import { byPriority, OrderCard } from "../components/OrderCard";
import { PushButton } from "../components/PushButton";
import { Bar, Empty, ErrorLine } from "../components/ui";
import { useMe } from "../lib/auth";
import { loadOrders } from "../lib/data";
import { useLive } from "../lib/hooks";

export function DesignerHome() {
  const me = useMe();
  const { data, error } = useLive(() => loadOrders(14), ["orders"]);
  // כל ההזמנות, כולל חדשות מוואטסאפ, ברשימה אחת
  const orders = [...(data ?? [])].sort(byPriority);

  return (
    <div className="screen">
      <Bar title="הזמנות" sub={me.name} avatar="ג" right={<PushButton />} />
      <div className="scroll">
        <ErrorLine error={error} />
        {!data && !error && <Empty>טוען…</Empty>}
        {data && (orders.length ? orders.map((o) => <OrderCard key={o.id} o={o} role="designer" />) : <Empty>אין הזמנות</Empty>)}
      </div>
    </div>
  );
}
