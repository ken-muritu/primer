import { getClient, newId } from "./db";
import { crawl, hashText, type CrawledPage } from "./crawl";
import { embed, serialize } from "./embeddings";

export type IngestResult = { pages: number; chunks: number };

function chunkPage(page: CrawledPage): { content: string; section: string }[] {
  const size = 500;
  const overlap = 80;
  const out: { content: string; section: string }[] = [];
  const text = page.text;
  if (text.length <= size) {
    out.push({ content: text, section: page.sectionTitle });
    return out;
  }
  let i = 0;
  while (i < text.length) {
    out.push({ content: text.slice(i, i + size), section: page.sectionTitle });
    i += size - overlap;
  }
  return out;
}

// Ingest a Space's source URL: crawl -> store source_pages -> chunk -> embed.
// Driven by a job so it never blocks the user's request.
export async function ingestSpace(spaceId: string, sourceUrl: string): Promise<IngestResult> {
  const client = await getClient();
  const version = new Date().toISOString().slice(0, 10);

  await client.execute({
    sql: `UPDATE spaces SET status = 'ingesting', version_label = ?, last_synced = datetime('now') WHERE id = ?`,
    args: [version, spaceId],
  });

  const pages = await crawl(sourceUrl);
  let chunkCount = 0;

  for (const page of pages) {
    const hash = hashText(page.url + page.markdown.slice(0, 200));
    const existing = await client.execute({
      sql: `SELECT id FROM source_pages WHERE space_id = ? AND url = ?`,
      args: [spaceId, page.url],
    });
    let pageId: string;
    if (existing.rows.length) {
      pageId = existing.rows[0].id as string;
      await client.execute({
        sql: `UPDATE source_pages SET title = ?, markdown = ?, hash = ?, last_crawled = datetime('now') WHERE id = ?`,
        args: [page.title, page.markdown, hash, pageId],
      });
    } else {
      pageId = newId("pg");
      await client.execute({
        sql: `INSERT INTO source_pages (id, space_id, url, title, markdown, hash, last_crawled) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        args: [pageId, spaceId, page.url, page.title, page.markdown, hash],
      });
    }

    const chunks = chunkPage(page);
    for (const c of chunks) {
      const id = newId("chk");
      const vec = await embed(`${c.section}\n${c.content}`);
      await client.execute({
        sql: `INSERT INTO chunks (id, space_id, page_id, content, embedding, section_title) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [id, spaceId, pageId, c.content, serialize(vec), c.section],
      });
      chunkCount++;
    }
  }

  await client.execute({
    sql: `UPDATE spaces SET status = 'ready' WHERE id = ?`,
    args: [spaceId],
  });
  return { pages: pages.length, chunks: chunkCount };
}
