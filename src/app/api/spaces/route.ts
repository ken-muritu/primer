import { NextRequest, NextResponse } from "next/server";
import { getClient, newId } from "@/lib/db";
import { getOrCreateUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Create a Space from a URL. Ingestion is queued (job), never run inline, so
// the request returns immediately and the user is never blocked.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sourceUrl = (body.sourceUrl || "").trim();
    const title = (body.title || "").trim() || sourceUrl;
    if (!/^https?:\/\//.test(sourceUrl)) {
      return NextResponse.json({ error: "A valid http(s) docs URL is required." }, { status: 400 });
    }

    const client = await getClient();

    // Reuse an already-ingested Space for the same URL (public sharing).
    const existing = await client.execute({
      sql: `SELECT id, status FROM spaces WHERE source_url = ? ORDER BY created_at DESC LIMIT 1`,
      args: [sourceUrl],
    });
    if (existing.rows.length) {
      const id = existing.rows[0].id as string;
      const status = existing.rows[0].status as string;
      if (status === "ready") {
        return NextResponse.json({ id, status: "ready", reused: true });
      }
      // Still ingesting/queued — hand back the id so the UI can poll.
      return NextResponse.json({ id, status }, { status: 202 });
    }

    const user = await getOrCreateUser();
    const id = newId("spc");
    await client.execute({
      sql: `INSERT INTO spaces (id, source_url, title, status, owner_id, is_public) VALUES (?, ?, ?, 'pending', ?, 1)`,
      args: [id, sourceUrl, title, user.userId],
    });
    const jobId = newId("job");
    await client.execute({
      sql: `INSERT INTO jobs (id, space_id, type, status) VALUES (?, ?, 'ingest', 'queued')`,
      args: [jobId, id],
    });

    return NextResponse.json({ id, status: "pending", jobId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 500 });
  }
}
