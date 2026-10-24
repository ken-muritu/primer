import { getClient } from "./db";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function awardXp(
  userId: string,
  spaceId: string,
  lessonId: string | null,
  xp: number
): Promise<{ totalXp: number; streak: number }> {
  const client = await getClient();
  await client.execute({
    sql: `INSERT INTO user_progress (user_id, space_id, lesson_id, xp, completed_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, space_id, lesson_id) DO UPDATE SET xp = excluded.xp, completed_at = excluded.completed_at`,
    args: [userId, spaceId, lessonId, xp],
  });

  const t = today();
  const streakRows = await client.execute({
    sql: `SELECT current_streak, last_activity_date FROM streaks WHERE user_id = ?`,
    args: [userId],
  });
  let streak = 1;
  if (streakRows.rows.length) {
    const r = streakRows.rows[0];
    const last = r.last_activity_date as string;
    if (last === t) {
      streak = Number(r.current_streak);
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      streak = last === yesterday ? Number(r.current_streak) + 1 : 1;
    }
  }
  await client.execute({
    sql: `INSERT INTO streaks (user_id, current_streak, last_activity_date) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET current_streak = excluded.current_streak, last_activity_date = excluded.last_activity_date`,
    args: [userId, streak, t],
  });

  const xpRows = await client.execute({
    sql: `SELECT COALESCE(SUM(xp),0) AS total FROM user_progress WHERE user_id = ? AND space_id = ?`,
    args: [userId, spaceId],
  });
  const totalXp = Number(xpRows.rows[0]?.total || 0);
  return { totalXp, streak };
}

export async function getStreak(userId: string): Promise<number> {
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT current_streak FROM streaks WHERE user_id = ?`,
    args: [userId],
  });
  return Number(rows.rows[0]?.current_streak || 0);
}
