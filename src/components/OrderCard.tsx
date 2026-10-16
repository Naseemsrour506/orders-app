import { Link } from "react-router-dom";
import { fmtDay, todayIL } from "../lib/dates";
import { FIELD_TEAMS } from "../lib/features";
import type { Order, Role, Team } from "../lib/types";
import { StatusChip } from "./ui";

export function isLate(o: Order): boolean {
  return (o.status === "design" || o.status === "fix") && !!o.design_due && o.design_due < todayIL();
}

export function isCarried(o: Order): boolean {
  return FIELD_TEAMS && o.status === "approved" && !!o.scheduled_date && o.scheduled_date < todayIL();
}

/** שורה אחת שאומרת מה צריך לקרות עכשיו, ומי צריך לעשות את זה */
function waiting(o: Order, role?: Role): { t: string; mine: boolean } | null {
  if (role === "manager") {
    if (o.status === "new") return { t: "מחכה לך: לשלוח לגרפיקאי", mine: true };
    if (o.status === "review") return { t: "מחכה לך: לאשר את הטיוטה", mine: true };
    if (o.status === "design") return { t: "מחכה לגרפיקאי: טיוטה", mine: false };
    if (o.status === "fix") return { t: "מחכה לגרפיקאי: תיקון", mine: false };
  }
  if (role === "designer") {
    if (o.status === "new") return { t: "מחכה לך: לאשר ולהתחיל עיצוב", mine: true };
    if (o.status === "design") return { t: "מחכה לך: טיוטה", mine: true };
    if (o.status === "fix") return { t: "מחכה לך: תיקון", mine: true };
    if (o.status === "review") return { t: "מחכה למנהל: אישור", mine: false };
  }
  return null;
}

export function OrderCard({ o, teams, showTeam, role }: { o: Order; teams?: Team[]; showTeam?: boolean; role?: Role }) {
  const team = teams?.find((t) => t.id === o.team_id);
  const tags: { t: string; c: string }[] = [];
  if (isCarried(o)) tags.push({ t: "מאתמול", c: "r" });
  if (isLate(o)) tags.push({ t: "באיחור", c: "r" });
  if (o.urgent && o.status !== "done" && (FIELD_TEAMS || o.status !== "approved")) tags.push({ t: "דחוף", c: "w" });
  if (o.field_issue && o.status === "approved") tags.push({ t: "⚠ הערה מהשטח", c: "w" });
  const fromWa = o.source === "whatsapp" && o.status === "new";
  const missing = fromWa ? (o.ai_details?.missing?.length ?? 0) : 0;
  if (fromWa) tags.push({ t: "מוואטסאפ", c: "g" });
  if (missing) tags.push({ t: `חסרים ${missing} פרטים`, c: "w" });
  const d = o.ai_details ?? {};
  const spec = fromWa ? [d.size, d.quantity && `כמות ${d.quantity}`, d.material, d.city].filter(Boolean).join(" · ") : "";
  const wait = waiting(o, role);
  return (
    <Link to={`/order/${o.id}`} className={`card ${isCarried(o) || isLate(o) ? "carry" : ""}`}>
      <div className="row">
        <span className="tt">{o.title || "ללא כותרת"}</span>
        <StatusChip status={o.status} />
      </div>
      <div className="sub">
        {[
          `#${o.id}`,
          o.client_name,
          FIELD_TEAMS && o.status === "approved" && o.scheduled_date ? fmtDay(o.scheduled_date) : null,
          showTeam && team ? team.name : null,
          (o.status === "design" || o.status === "fix") && o.design_due ? `עד ${fmtDay(o.design_due)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
      {spec && <div className="spec">{spec}</div>}
      {(wait || tags.length > 0) && (
        <div className="tags">
          {wait && <span className={`wait ${wait.mine ? "mine" : ""}`}>{wait.t}</span>}
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
