import { useEffect, useState } from "react";
import { useMe } from "../lib/auth";
import { enablePush, pushState } from "../lib/push";
import { useToast } from "./ui";

/** פעמון בכותרת: מפעיל התראות בטלפון הזה */
export function PushButton() {
  const me = useMe();
  const toast = useToast();
  const [state, setState] = useState<string>("loading");

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  if (state === "loading" || state === "unsupported") return null;
  if (state === "on") return <span className="bell on" title="התראות פעילות">🔔</span>;

  const on = async () => {
    try {
      await enablePush(me.id);
      setState("on");
      toast("התראות הופעלו בטלפון הזה");
    } catch (e) {
      toast((e as Error).message);
      setState(await pushState());
    }
  };
  return (
    <button className="cta small" onClick={on}>
      🔔 הפעל התראות
    </button>
  );
}
