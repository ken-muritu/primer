import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ingestSpace } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Trigger ingestion for a Space (used by the UI poll and by the cron worker).
// Runs synchronously within the request budget; for large crawls the cron
// worker retries until the Space reaches 'ready'.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();
  const space = await client.execute({ sql: `SELECT source_url, status FROM spaces WHERE id = ?`, args: [id] });
  if (!space.rows.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  const status = space.rows[0].status as string;
  if (status === "ready") return NextResponse.json({ status: "ready" });
  const sourceUrl = space.rows[0].source_url as string;

  await client.execute({
    sql: `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now') WHERE space_id = ? AND status != 'done'`,
    args: [id],
  });

  try {
    const res = await ingestSpace(id, sourceUrl);
    await client.execute({
      sql: `UPDATE jobs SET status = 'done', updated_at = datetime('now') WHERE space_id = ?`,
      args: [id],
    });
    return NextResponse.json({ status: "ready", ...res });
  } catch (e: any) {
    await client.execute({ sql: `UPDATE spaces SET status = 'failed' WHERE id = ?`, args: [id] });
    await client.execute({ sql: `UPDATE jobs SET status = 'failed', error = ? WHERE space_id = ?`, args: [String(e?.message || e), id] });
    return NextResponse.json({ status: "failed", error: e?.message }, { status: 500 });
  }
}
