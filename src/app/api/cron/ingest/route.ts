import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { ingestSpace } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Job-queue worker. Hit by the Vercel Cron (vercel.json, daily) and/or
// manually. Processes at most one queued ingest job so a user never waits
// inline on a crawl. Protected by CRON_SECRET.
function unauthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // undefended if no secret configured
  const auth = req.headers.get("authorization") || "";
  return auth !== `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return processNext();
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return processNext();
}

async function processNext() {
  const client = await getClient();
  // Reclaim jobs stuck in 'running' for > 5 min (e.g. timed-out lambda).
  await client.execute({
    sql: `UPDATE jobs SET status = 'queued' WHERE status = 'running' AND updated_at < datetime('now', '-5 minutes')`,
    args: [],
  });
  const job = await client.execute({
    sql: `SELECT id, space_id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`,
    args: [],
  });
  if (!job.rows.length) return NextResponse.json({ processed: false });

  const spaceId = job.rows[0].space_id as string;
  const space = await client.execute({ sql: `SELECT source_url, status FROM spaces WHERE id = ?`, args: [spaceId] });
  if (!space.rows.length) return NextResponse.json({ processed: false });

  await client.execute({
    sql: `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?`,
    args: [job.rows[0].id],
  });

  try {
    const res = await ingestSpace(spaceId, space.rows[0].source_url as string);
    await client.execute({ sql: `UPDATE jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?`, args: [job.rows[0].id] });
    return NextResponse.json({ processed: true, spaceId, ...res });
  } catch (e: any) {
    await client.execute({ sql: `UPDATE spaces SET status = 'failed' WHERE id = ?`, args: [spaceId] });
    await client.execute({ sql: `UPDATE jobs SET status = 'failed', error = ? WHERE id = ?`, args: [String(e?.message || e), job.rows[0].id] });
    return NextResponse.json({ processed: true, spaceId, error: e?.message }, { status: 500 });
  }
}
