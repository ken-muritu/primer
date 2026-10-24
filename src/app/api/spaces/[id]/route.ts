import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT id, source_url, title, status, is_public, version_label, last_synced, created_at
          FROM spaces WHERE id = ?`,
    args: [id],
  });
  if (!rows.rows.length) return NextResponse.json({ error: "Space not found" }, { status: 404 });
  const r = rows.rows[0];
  const lessonRows = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM lessons WHERE space_id = ?`,
    args: [id],
  });
  const pageRows = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM source_pages WHERE space_id = ?`,
    args: [id],
  });
  return NextResponse.json({
    id: r.id,
    sourceUrl: r.source_url,
    title: r.title,
    status: r.status,
    isPublic: Number(r.is_public) === 1,
    versionLabel: r.version_label,
    lastSynced: r.last_synced,
    createdAt: r.created_at,
    lessonCount: Number(lessonRows.rows[0]?.c || 0),
    pageCount: Number(pageRows.rows[0]?.c || 0),
  });
}
