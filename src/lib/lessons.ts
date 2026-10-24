import { getClient, newId } from "./db";
import { complete } from "./llm";


export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

export type Lesson = {
  id: string;
  spaceId: string;
  title: string;
  order: number;
  contentJson: any;
};

// Deterministic local lesson/quiz generator (no LLM required).
function localOutline(spaceTitle: string): string[] {
  return [
    `Introduction to ${spaceTitle}`,
    `Core Concepts of ${spaceTitle}`,
    `Working with ${spaceTitle}`,
    `Advanced Usage of ${spaceTitle}`,
  ];
}

function localQuiz(sectionTitle: string, sample: string): QuizQuestion[] {
  const topic = sectionTitle.replace(/^(Introduction to|Core Concepts of|Working with|Advanced Usage of)\s+/, "");
  const base = sample.slice(0, 140).trim() || `key ideas about ${topic}`;
  return [
    {
      question: `Which statement best describes ${topic}?`,
      options: [
        `It is covered in the official docs ingested for this Space`,
        `It is an unrelated third-party tool`,
        `It requires a paid license by default`,
        `It cannot be learned from documentation`,
      ],
      correctIndex: 0,
    },
    {
      question: `What is the primary purpose of ${topic}?`,
      options: [
        `To replace the documentation entirely`,
        `To help you accomplish tasks described in the docs: "${base.slice(0, 60)}…"`,
        `To disable the tool`,
        `None of the above`,
      ],
      correctIndex: 1,
    },
    {
      question: `Where should you look to verify details about ${topic}?`,
      options: [
        `The source documentation linked in this Space`,
        `A random forum post`,
        `Guesswork`,
        `Social media`,
      ],
      correctIndex: 0,
    },
    {
      question: `True or False: learning ${topic} is easier with bite-sized lessons.`,
      options: [`True`, `False`],
      correctIndex: 0,
    },
    {
      question: `What does Primer do with the docs you pasted?`,
      options: [
        `Crawls, chunks, and embeds them so you can chat and learn`,
        `Deletes them`,
        `Publishes them publicly without your control`,
        `Ignores them`,
      ],
      correctIndex: 0,
    },
  ];
}

export async function generateLessons(spaceId: string, spaceTitle: string): Promise<Lesson[]> {
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT content, section_title FROM chunks WHERE space_id = ? ORDER BY rowid LIMIT 40`,
    args: [spaceId],
  });
  const sample = (rows.rows[0]?.content as string) || "";

  let outline = localOutline(spaceTitle);
  const llm = await complete(
    `You are a curriculum designer. Given a tool's documentation, propose 3-5 lesson titles as a JSON array of strings, progressing from intro to advanced.`,
    [{ role: "user", content: `Tool: ${spaceTitle}\nSample doc text:\n${sample.slice(0, 1500)}` }],
    { maxTokens: 400, temperature: 0.3 }
  );
  if (llm) {
    try {
      const parsed = JSON.parse(llm.replace(/```json|```/g, "").trim());
      if (Array.isArray(parsed) && parsed.length) outline = parsed.map(String);
    } catch {
      /* keep local outline */
    }
  }

  const lessons: Lesson[] = [];
  for (let i = 0; i < outline.length; i++) {
    const title = outline[i];
    const id = newId("les");
    const contentJson = {
      summary: `Lessons in this Space are generated from the ingested docs. This lesson covers: ${title}.`,
      section: title,
    };
    const quiz = localQuiz(title, sample);
    await client.execute({
      sql: `INSERT INTO lessons (id, space_id, title, "order", content_json) VALUES (?, ?, ?, ?, ?)`,
      args: [id, spaceId, title, i, JSON.stringify(contentJson)],
    });
    for (const q of quiz) {
      const qid = newId("qq");
      await client.execute({
        sql: `INSERT INTO quiz_questions (id, lesson_id, question, options, correct_index) VALUES (?, ?, ?, ?, ?)`,
        args: [qid, id, q.question, JSON.stringify(q.options), q.correctIndex],
      });
    }
    lessons.push({ id, spaceId, title, order: i, contentJson });
  }
  return lessons;
}

export async function getLessons(spaceId: string): Promise<Lesson[]> {
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT id, space_id, title, "order", content_json FROM lessons WHERE space_id = ? ORDER BY "order"`,
    args: [spaceId],
  });
  return rows.rows.map((r) => ({
    id: r.id as string,
    spaceId: r.space_id as string,
    title: r.title as string,
    order: Number(r.order),
    contentJson: JSON.parse((r.content_json as string) || "{}"),
  }));
}

export async function getQuiz(lessonId: string): Promise<QuizQuestion[]> {
  const client = await getClient();
  const rows = await client.execute({
    sql: `SELECT question, options, correct_index FROM quiz_questions WHERE lesson_id = ?`,
    args: [lessonId],
  });
  return rows.rows.map((r) => ({
    question: r.question as string,
    options: JSON.parse((r.options as string) || "[]"),
    correctIndex: Number(r.correct_index),
  }));
}
