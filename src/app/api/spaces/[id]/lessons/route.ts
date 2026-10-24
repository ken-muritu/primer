import { NextRequest, NextResponse } from "next/server";
import { getClient } from "@/lib/db";
import { getLessons, getQuiz, generateLessons } from "@/lib/lessons";

export const dynamic = "force-dynamic";

// GET lessons for a Space. Lessons are generated LAZILY on first read (the
// "Course" tab), then cached — so users who only chat never pay for generation.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();
  const count = await client.execute({
    sql: `SELECT COUNT(*) AS c FROM lessons WHERE space_id = ?`,
    args: [id],
  });
  if (Number(count.rows[0]?.c || 0) === 0) {
    const meta = await client.execute({
      sql: `SELECT title FROM spaces WHERE id = ?`,
      args: [id],
    });
    const title = (meta.rows[0]?.title as string) || "this tool";
    await generateLessons(id, title);
  }
  const lessons = await getLessons(id);
  const withQuiz = await Promise.all(lessons.map(async (l) => ({ ...l, quiz: await getQuiz(l.id) })));
  return NextResponse.json({ lessons: withQuiz });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient();
  const meta = await client.execute({ sql: `SELECT title FROM spaces WHERE id = ?`, args: [id] });
  const title = (meta.rows[0]?.title as string) || "this tool";
  const lessons = await generateLessons(id, title);
  return NextResponse.json({ lessons: lessons.length });
}
