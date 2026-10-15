import { Link } from "react-router-dom";
import { fmtDay, todayIL } from "../lib/dates";
import type { Order, Team } from "../lib/types";
import { StatusChip } from "./ui";

export function isLate(o: Order): boolean {
  return (o.status === "design" || o.status === "fix") && !!o.design_due && o.design_due < todayIL();
}

export function isCarried(o: Order): boolean {
  return o.status === "approved" && !!o.scheduled_date && o.scheduled_date < todayIL();
}

export function OrderCard({ o, teams, showTeam }: { o: Order; teams?: Team[]; showTeam?: boolean }) {
  const team = teams?.find((t) => t.id === o.team_id);
  const tags: { t: string; c: string }[] = [];
  if (isCarried(o)) tags.push({ t: "מאתמול", c: "r" });
  if (isLate(o)) tags.push({ t: "באיחור", c: "r" });
  if (o.urgent && o.status !== "done") tags.push({ t: "דחוף", c: "w" });
  if (o.field_issue && o.status === "approved") tags.push({ t: "⚠ הערה מהשטח", c: "w" });
  if (o.source === "whatsapp" && o.status === "new") tags.push({ t: "מוואטסאפ", c: "g" });
  return (
    <Link to={`/order/${o.id}`} className={`card ${isCarried(o) || isLate(o) ? "carry" : ""}`}>
      <div className="row">
        <span className="num">#{o.id}</span>
        <StatusChip status={o.status} />
      </div>
      <div className="tt">{o.title || "ללא כותרת"}</div>
      <div className="sub">
        {[
          o.client_name,
          o.status === "approved" && o.scheduled_date ? fmtDay(o.scheduled_date) : null,
          showTeam && team ? team.name : null,
          (o.status === "design" || o.status === "fix") && o.design_due ? `עד ${fmtDay(o.design_due)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {tags.length > 0 && (
        <div className="tags">
          {tags.map((t) => (
            <span key={t.t} className={`chip ${t.c}`}>
              {t.t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

/** סדר עדיפויות: מאתמול/באיחור, דחוף, הועלה לראש, ישן קודם */
export function byPriority(a: Order, b: Order): number {
  const late = (o: Order) => (isCarried(o) || isLate(o) ? 1 : 0);
  return (
    late(b) - late(a) ||
    (a.status === "approved" && b.status === "approved" ? (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "") : 0) ||
    Number(b.urgent) - Number(a.urgent) ||
    (b.bumped_at ?? "").localeCompare(a.bumped_at ?? "") ||
    a.created_at.localeCompare(b.created_at)
  );
}
