import { supabase } from "./supabase";
import type { Member, Message, Order, Team } from "./types";

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** הזמנות פתוחות, ועוד אלה שנסגרו בימים האחרונים */
export async function loadOrders(closedDays = 7): Promise<Order[]> {
  const since = new Date(Date.now() - closedDays * 86400_000).toISOString();
  return check(
    await supabase
      .from("orders")
      .select("*")
      .or(`status.neq.done,done_at.gte.${since}`)
      .order("created_at", { ascending: false })
      .limit(500),
  );
}

export async function loadOrder(id: number): Promise<Order | null> {
  return check(await supabase.from("orders").select("*").eq("id", id).maybeSingle());
}

export async function loadMessages(orderId: number): Promise<Message[]> {
  return check(await supabase.from("messages").select("*").eq("order_id", orderId).order("created_at").order("id"));
}

let teamsCache: Team[] | null = null;
export async function loadTeams(): Promise<Team[]> {
  if (teamsCache) return teamsCache;
  teamsCache = check(await supabase.from("teams").select("*").order("id"));
  return teamsCache;
}

export async function loadMembers(): Promise<Member[]> {
  return check(await supabase.from("members").select("*").order("created_at"));
}

export async function searchOrders(q: string): Promise<Order[]> {
  const term = q.trim().replace(/[%,()]/g, " ");
  if (!term) return [];
  const asNum = /^\d+$/.test(term) ? `,id.eq.${term}` : "";
  return check(
    await supabase
      .from("orders")
      .select("*")
      .or(`title.ilike.%${term}%,client_name.ilike.%${term}%,client_phone.ilike.%${term}%${asNum}`)
      .order("created_at", { ascending: false })
      .limit(50),
  );
}
