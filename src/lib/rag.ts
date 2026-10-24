import { getClient } from "./db";
import { embed, deserialize, similarity } from "./embeddings";
import { complete } from "./llm";

export type RetrievedChunk = {
  content: string;
  url: string | null;
  title: string | null;
  section: string | null;
  score: number;
};

export async function retrieve(spaceId: string, query: string, topK = 5): Promise<RetrievedChunk[]> {
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT c.content, c.embedding, c.section_title, p.url AS url, p.title AS title
          FROM chunks c LEFT JOIN source_pages p ON c.page_id = p.id
          WHERE c.space_id = ?`,
    args: [spaceId],
  });
  const qVec = await embed(query);
  const scored = rows.rows.map((row) => ({
    content: row.content as string,
    url: (row.url as string) || null,
    title: (row.title as string) || null,
    section: (row.section_title as string) || null,
    score: row.embedding ? similarity(qVec, deserialize(row.embedding as string)) : 0,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export type Answer = {
  text: string;
  citations: { url: string | null; title: string | null; section: string | null }[];
  usedLLM: boolean;
};

export async function answerQuestion(spaceId: string, question: string): Promise<Answer> {
  const ctx = await retrieve(spaceId, question, 5);
  const citations = ctx.map((c) => ({ url: c.url, title: c.title, section: c.section }));

  const contextText = ctx
    .map((c, i) => `[${i + 1}] (${c.title || c.section || "doc"} — ${c.url || "n/a"})\n${c.content}`)
    .join("\n\n");

  const system = `You are Primer, a tutor that answers ONLY from the provided documentation excerpts. Cite the source by writing [n] next to facts, matching the source numbers. If the answer is not in the excerpts, say you don't know from these docs. Never invent facts.`;

  const llm = await complete(
    system,
    [{ role: "user", content: `Documentation:\n${contextText}\n\nQuestion: ${question}` }],
    { maxTokens: 700 }
  );

  if (llm) return { text: llm, citations, usedLLM: true };

  const top = ctx.slice(0, 2);
  const text =
    top.length === 0
      ? "I couldn't find anything about that in the ingested docs for this Space yet."
      : "Based on the docs:\n\n" +
        top.map((c, i) => `• ${c.content.slice(0, 400)}${c.content.length > 400 ? "…" : ""} [${i + 1}]`).join("\n\n");
  return { text, citations, usedLLM: false };
}
