import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { byPriority, OrderCard } from "../components/OrderCard";
import { PushButton } from "../components/PushButton";
import { Bar, Empty, ErrorLine, Tabs } from "../components/ui";
import { loadOrders, loadTeams, searchOrders } from "../lib/data";
import { FIELD_TEAMS } from "../lib/features";
import { useLive } from "../lib/hooks";
import type { Order, Team } from "../lib/types";

export function ManagerTabs() {
  const { pathname } = useLocation();
  return (
    <Tabs
      items={[
        { to: "/", label: "הזמנות", active: pathname === "/" },
        { to: "/users", label: "צוות", active: pathname.startsWith("/users") },
      ]}
    />
  );
}

interface Group {
  id: string;
  title: string;
  short: string;
  list: Order[];
  mine?: boolean;
  showTeam?: boolean;
}

function Section({ g, teams }: { g: Group; teams: Team[] }) {
  if (!g.list.length) return null;
  return (
    <>
      <div className="sec" id={g.id}>
        {g.title} <span className="count">{g.list.length}</span>
      </div>
      {g.list.map((o) => (
        <OrderCard key={o.id} o={o} teams={teams} showTeam={g.showTeam} role="manager" />
      ))}
    </>
  );
}

/** פס המונים: כמה הזמנות בכל שלב. לחיצה קופצת לקבוצה */
function Stats({ groups }: { groups: Group[] }) {
  return (
    <div className="stats">
      {groups.map((g) => (
        <button
          key={g.id}
          className={`stat ${g.mine && g.list.length ? "mine" : ""}`}
          disabled={!g.list.length}
          onClick={() => document.getElementById(g.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <b>{g.list.length}</b>
          <span>{g.short}</span>
        </button>
      ))}
    </div>
  );
}

const WEEK = 7 * 86400_000;

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
  // בלי צוותי שטח, "אושר" הוא סוף הדרך: מציגים את מה שאושר בשבוע האחרון
  const approved = orders
    .filter((o) => (o.status === "approved" || o.status === "done") && Date.now() - Date.parse(o.approved_at ?? o.updated_at) < WEEK)
    .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""));
  const open = orders.filter((o) => (FIELD_TEAMS ? o.status !== "done" : o.status !== "done" && o.status !== "approved")).length;

  const groups: Group[] = [
    { id: "g-mine", title: "הכדור אצלך", short: "אצלך", list: mine, mine: true },
    { id: "g-design", title: "אצל הגרפיקאי", short: "בעיצוב", list: designer },
    ...(FIELD_TEAMS
      ? [
          { id: "g-field", title: "לביצוע בשטח", short: "בשטח", list: field, showTeam: true },
          { id: "g-done", title: "בוצעו בשבוע האחרון", short: "בוצעו", list: done, showTeam: true },
        ]
      : [{ id: "g-approved", title: "אושרו בשבוע האחרון", short: "אושרו", list: approved }]),
  ];

  const search = async (v: string) => {
    setQ(v);
    setFound(v.trim().length >= 2 ? await searchOrders(v).catch(() => []) : null);
  };

  return (
    <div className="screen">
      <Bar title="הזמנות" sub={`${open} פתוחות`} avatar="מ" right={<PushButton />} />
      <ManagerTabs />
      <div className="scroll">
        <input className="search" type="search" placeholder="חיפוש לפי לקוח, טלפון או מספר" value={q} onChange={(e) => search(e.target.value)} />
        <ErrorLine error={error} />
        {found ? (
          found.length ? (
            found.map((o) => <OrderCard key={o.id} o={o} teams={teams} showTeam={FIELD_TEAMS} role="manager" />)
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
            {data && orders.length > 0 && <Stats groups={groups} />}
            {groups.map((g) => (
              <Section key={g.id} g={g} teams={teams} />
            ))}
          </>
        )}
      </div>
      <Link to="/new" className="fab" aria-label="הזמנה חדשה">
        +
      </Link>
    </div>
  );
}
