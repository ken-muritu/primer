import { NextRequest, NextResponse } from "next/server";
import { awardXp } from "@/lib/progress";
import { getOrCreateUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getOrCreateUser();
  const body = await req.json().catch(() => ({}));
  const lessonId = body.lessonId || null;
  const xp = Number(body.xp || 25);
  const res = await awardXp(user.userId, id, lessonId, xp);
  return NextResponse.json(res);
}
