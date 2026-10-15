import { useEffect, useState } from "react";
import { Bar } from "../components/ui";
import { loadTeams } from "../lib/data";
import { fmtLongToday } from "../lib/dates";
import type { Team } from "../lib/types";
import { FieldList } from "./FieldHome";
import { ManagerTabs } from "./ManagerHome";

/** המנהל רואה את הרשימה של היום של כל צוות, כמו שהצוות רואה אותה */
export function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState(1);
  useEffect(() => {
    loadTeams().then(setTeams).catch(() => undefined);
  }, []);
  return (
    <div className="screen">
      <Bar title="צוותי שטח" sub={fmtLongToday()} avatar="מ" />
      <ManagerTabs />
      <div className="seg">
        {teams.map((t) => (
          <button key={t.id} className={t.id === team ? "on" : ""} onClick={() => setTeam(t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <FieldList team={team} asManager />
    </div>
  );
}
