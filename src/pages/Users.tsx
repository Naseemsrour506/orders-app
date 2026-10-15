import { useState } from "react";
import { Bar, Empty, ErrorLine, Sheet, useBusy } from "../components/ui";
import { joinLink, rpc, waLink } from "../lib/api";
import { useMe } from "../lib/auth";
import { loadMembers, loadTeams } from "../lib/data";
import { useLive } from "../lib/hooks";
import { ROLE_LABEL, type Member, type Role } from "../lib/types";
import { ManagerTabs } from "./ManagerHome";
import { FIELD_TEAMS } from "../lib/features";

/** המנהל מוסיף משתמשים ושולח להם קישור אישי בווטסאפ */
export function Users() {
  const me = useMe();
  const { data, error, reload } = useLive(async () => ({ members: await loadMembers(), teams: await loadTeams() }), ["members"]);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const [menu, setMenu] = useState<Member | null>(null);
  const { busy, run } = useBusy();

  const teams = data?.teams ?? [];
  const members = data?.members ?? [];

  const reset = (m: Member) =>
    run(async () => {
      const token = await rpc<string>("reset_member_link", { p_member_id: m.id });
      setMenu(null);
      setLink({ name: m.name, url: joinLink(token) });
    }, "נוצר קישור חדש. הקישור הקודם הפסיק לעבוד");

  const toggle = (m: Member) =>
    run(async () => {
      await rpc("set_member_active", { p_member_id: m.id, p_active: !m.active });
      setMenu(null);
      reload();
    }, m.active ? "המשתמש נחסם" : "המשתמש הופעל");

  return (
    <div className="screen">
      <Bar title="משתמשים" sub="כניסה בקישור אישי, בלי סיסמה" avatar="מ" />
      <ManagerTabs />
      <div className="scroll">
        <ErrorLine error={error} />
        {!data && !error && <Empty>טוען…</Empty>}
        {members.filter((m) => FIELD_TEAMS || m.role !== "field").map((m) => (
          <button key={m.id} className={`card member ${m.active ? "" : "off"}`} onClick={() => setMenu(m)}>
            <div className="row">
              <span className="tt">{m.name}</span>
              <span className="chip">{m.active ? (m.role === "field" ? teams.find((t) => t.id === m.team_id)?.name : ROLE_LABEL[m.role]) : "חסום"}</span>
            </div>
            {m.id === me.id && <div className="sub">זה אתה</div>}
          </button>
        ))}
        <button className="cta" onClick={() => setAdding(true)}>
          + הוספת משתמש
        </button>
        <p className="sub">
          {FIELD_TEAMS && "לכל צוות שטח יש קישור אחד שעובד בכל הטלפונים של הצוות. "}אם קישור הגיע לידיים לא נכונות או שטלפון אבד, לחצו על המשתמש
          וצרו קישור חדש.
        </p>
      </div>
      {adding && (
        <AddSheet
          teams={teams}
          onClose={() => setAdding(false)}
          onCreated={(name, url) => {
            setAdding(false);
            setLink({ name, url });
            reload();
          }}
        />
      )}
      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <button className="cta" disabled={busy} onClick={() => reset(menu)}>
            צור קישור חדש ושלח
          </button>
          {menu.id !== me.id && (
            <button className="cta warn" disabled={busy} onClick={() => toggle(menu)}>
              {menu.active ? "חסום משתמש" : "הפעל מחדש"}
            </button>
          )}
          <p className="sub">קישור חדש מבטל את הקודם מיד, בכל הטלפונים.</p>
        </Sheet>
      )}
      {link && <LinkSheet name={link.name} url={link.url} onClose={() => setLink(null)} />}
    </div>
  );
}

function AddSheet({
  teams,
  onClose,
  onCreated,
}: {
  teams: { id: number; name: string }[];
  onClose: () => void;
  onCreated: (name: string, url: string) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>(FIELD_TEAMS ? "field" : "designer");
  const [team, setTeam] = useState(teams[0]?.id ?? 1);
  const { busy, run } = useBusy();
  const create = () =>
    run(async () => {
      const r = await rpc<{ token: string }>("create_member", {
        p_name: name || (role === "field" ? teams.find((t) => t.id === team)?.name : ROLE_LABEL[role]),
        p_role: role,
        p_team_id: role === "field" ? team : null,
      });
      onCreated(name || ROLE_LABEL[role], joinLink(r.token));
    });
  return (
    <Sheet title="משתמש חדש" onClose={onClose}>
      <div className="seg">
        {((FIELD_TEAMS ? ["field", "designer", "manager"] : ["designer", "manager"]) as Role[]).map((r) => (
          <button key={r} className={r === role ? "on" : ""} onClick={() => setRole(r)}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      {role === "field" && (
        <div className="seg">
          {teams.map((t) => (
            <button key={t.id} className={t.id === team ? "on" : ""} onClick={() => setTeam(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <label>
        שם
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={role === "field" ? "למשל: צוות 1 (אחמד ויוסי)" : "שם"}
        />
      </label>
      <button className="cta" onClick={create} disabled={busy}>
        צור קישור
      </button>
    </Sheet>
  );
}

function LinkSheet({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const msg = `היי, זה הקישור שלך לאפליקציית ההזמנות:\n${url}\nפותחים אותו בכרום, ואז "הוספה למסך הבית".`;
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title={`הקישור של ${name}`} onClose={onClose}>
      <div className="link-box">{url}</div>
      <a className="cta wa-btn" href={waLink(msg)} target="_blank" rel="noreferrer">
        שלח בווטסאפ
      </a>
      <button
        className="cta ghost"
        onClick={async () => {
          await navigator.clipboard?.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? "הועתק ✓" : "העתק קישור"}
      </button>
      <p className="sub">הקישור מוצג רק עכשיו. אם הוא יאבד, אפשר ליצור חדש בכל רגע.</p>
    </Sheet>
  );
}
