import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const question = (body.question || "").trim();
  if (!question) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  try {
    const answer = await answerQuestion(id, question);
    return NextResponse.json(answer);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "chat failed" }, { status: 500 });
  }
}
