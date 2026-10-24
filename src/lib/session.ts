import { cookies } from "next/headers";
import { getClient, newId } from "./db";

const COOKIE = "primer_session";

export type SessionUser = {
  userId: string;
  email: string | null;
  name: string | null;
};

export async function getOrCreateUser(): Promise<SessionUser> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const client = await getClient();
  if (token) {
    const rows = await client.execute({
      sql: `SELECT user_id, email, name FROM sessions WHERE token = ?`,
      args: [token],
    });
    if (rows.rows.length) {
      const r = rows.rows[0];
      return { userId: r.user_id as string, email: (r.email as string) ?? null, name: (r.name as string) ?? null };
    }
  }
  const userId = newId("usr");
  const newToken = newId("tok");
  await client.execute({
    sql: `INSERT INTO sessions (token, user_id, email, name) VALUES (?, ?, ?, ?)`,
    args: [newToken, userId, null, null],
  });
  store.set(COOKIE, newToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return { userId, email: null, name: null };
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT user_id, email, name FROM sessions WHERE token = ?`,
    args: [token],
  });
  if (!rows.rows.length) return null;
  const r = rows.rows[0];
  return { userId: r.user_id as string, email: (r.email as string) ?? null, name: (r.name as string) ?? null };
}
