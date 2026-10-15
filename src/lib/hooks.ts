import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/** טוען נתונים, ומרענן כשמשהו משתנה בטבלאות שצוינו או כשחוזרים לאפליקציה. */
export function useLive<T>(load: () => Promise<T>, tables: string[], deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    reload();
    let timer: number | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reload, 250);
    };
    const channel = supabase.channel(`live-${tables.join("-")}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) channel.on("postgres_changes", { event: "*", schema: "public", table: t }, soon);
    channel.subscribe();
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reload);
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, reload, setData };
}
