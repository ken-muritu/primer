import { NextResponse } from "next/server";
import { getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public, ready Spaces for the landing-page gallery.
export async function GET() {
  try {
    const client = await getClient();
    const rows = await client.execute({
      sql: `SELECT id, title, source_url, status, (SELECT COUNT(*) FROM source_pages sp WHERE sp.space_id = spaces.id) AS page_count
            FROM spaces WHERE status = 'ready' AND is_public = 1 ORDER BY created_at DESC LIMIT 12`,
      args: [],
    });
    const spaces = rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      sourceUrl: r.source_url,
      status: r.status,
      pageCount: Number(r.page_count || 0),
    }));
    return NextResponse.json({ spaces });
  } catch {
    return NextResponse.json({ spaces: [] });
  }
}
