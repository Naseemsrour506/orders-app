import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { byPriority, OrderCard } from "../components/OrderCard";
import { PushButton } from "../components/PushButton";
import { Bar, Empty, ErrorLine, Tabs } from "../components/ui";
import { loadOrders, loadTeams, searchOrders } from "../lib/data";
import { useLive } from "../lib/hooks";
import type { Order, Team } from "../lib/types";

export function ManagerTabs() {
  const { pathname } = useLocation();
  return (
    <Tabs
      items={[
        { to: "/", label: "הזמנות", active: pathname === "/" },
        { to: "/teams", label: "צוותים", active: pathname.startsWith("/teams") },
        { to: "/users", label: "משתמשים", active: pathname.startsWith("/users") },
      ]}
    />
  );
}

function Section({ title, list, teams, showTeam }: { title: string; list: Order[]; teams: Team[]; showTeam?: boolean }) {
  if (!list.length) return null;
  return (
    <>
      <div className="sec">
        {title} <span className="count">{list.length}</span>
      </div>
      {list.map((o) => (
        <OrderCard key={o.id} o={o} teams={teams} showTeam={showTeam} />
      ))}
    </>
  );
}

export function ManagerHome() {
  const { data, error } = useLive(async () => ({ orders: await loadOrders(), teams: await loadTeams() }), ["orders"]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Order[] | null>(null);

  const orders = data?.orders ?? [];
  const teams = data?.teams ?? [];
  const mine = orders
    .filter((o) => o.status === "new" || o.status === "review" || (o.status === "approved" && o.field_issue))
    .sort(byPriority);
  const designer = orders.filter((o) => o.status === "design" || o.status === "fix").sort(byPriority);
  const field = orders.filter((o) => o.status === "approved" && !o.field_issue).sort(byPriority);
  const done = orders.filter((o) => o.status === "done").sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  const search = async (v: string) => {
    setQ(v);
    setFound(v.trim().length >= 2 ? await searchOrders(v).catch(() => []) : null);
  };

  return (
    <div className="screen">
      <Bar title="הזמנות" sub={`${orders.length - done.length} פתוחות`} avatar="מ" right={<PushButton />} />
      <ManagerTabs />
      <div className="scroll">
        <input className="search" type="search" placeholder="חיפוש לפי לקוח, טלפון או מספר" value={q} onChange={(e) => search(e.target.value)} />
        <ErrorLine error={error} />
        {found ? (
          found.length ? (
            found.map((o) => <OrderCard key={o.id} o={o} teams={teams} showTeam />)
          ) : (
            <Empty>לא נמצאו הזמנות</Empty>
          )
        ) : (
          <>
            {!data && !error && <Empty>טוען…</Empty>}
            {data && orders.length === 0 && (
              <Empty>
                אין עדיין הזמנות. שתפו הודעה מווטסאפ אל "הזמנות", או לחצו + כדי לפתוח הזמנה ידנית.
              </Empty>
            )}
            <Section title="הכדור אצלך" list={mine} teams={teams} />
            <Section title="אצל הגרפיקאי" list={designer} teams={teams} />
            <Section title="לביצוע בשטח" list={field} teams={teams} showTeam />
            <Section title="בוצעו בשבוע האחרון" list={done} teams={teams} showTeam />
          </>
        )}
      </div>
      <Link to="/new" className="fab" aria-label="הזמנה חדשה">
        +
      </Link>
    </div>
  );
}
