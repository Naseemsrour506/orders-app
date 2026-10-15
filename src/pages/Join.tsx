import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/types";

export function Join() {
  const { join } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("t");
    if (!token) {
      setError("הקישור חסר. בקשו מהמנהל לשלוח אותו שוב");
      return;
    }
    join(token)
      .then((m) => {
        history.replaceState(null, "", "/");
        nav("/", { replace: true, state: { welcome: `שלום ${m.name} · ${ROLE_LABEL[m.role]}` } });
      })
      .catch((e) => setError((e as Error).message));
  }, [join, nav]);

  return (
    <div className="center-page">
      <div className="logo">הזמנות</div>
      {error ? <p className="error">{error}</p> : <p>מתחבר…</p>}
    </div>
  );
}
