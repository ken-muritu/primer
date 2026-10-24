import * as cheerio from "cheerio";

export type CrawledPage = {
  url: string;
  title: string;
  sectionTitle: string;
  text: string;
  markdown: string;
};

const MAX_PAGES = Number(process.env.PRIMER_MAX_PAGES || 60);

function sameDomain(base: string, url: string): boolean {
  try {
    return new URL(url).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

function absolutize(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

// Strip chrome and return a normalized markdown-ish body for storage.
function clean(html: string): { title: string; sectionTitle: string; text: string; markdown: string } {
  const $: any = cheerio.load(html);
  for (const sel of ["script", "style", "nav", "footer", "header", "noscript", "svg", "form", "aside"]) {
    ($(sel) as any).remove();
  }
  const title = $("title").first().text().trim() || "";
  const h =
    $("h1").first().text().trim() ||
    $("h2").first().text().trim() ||
    title;

  const lines: string[] = [];
  $("h1, h2, h3, h4, p, li, code, pre").each((_: any, el: any) => {
    const tag = (el.name || "").toLowerCase();
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (tag === "h1") lines.push(`# ${t}`);
    else if (tag === "h2") lines.push(`## ${t}`);
    else if (tag === "h3") lines.push(`### ${t}`);
    else if (tag === "h4") lines.push(`#### ${t}`);
    else if (tag === "pre" || tag === "code") lines.push("```\n" + t + "\n```");
    else if (tag === "li") lines.push(`- ${t}`);
    else lines.push(t);
  });
  const markdown = lines.join("\n\n");
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return { title, sectionTitle: h, text: bodyText, markdown };
}

export async function crawl(startUrl: string): Promise<CrawledPage[]> {
  const visited = new Set<string>();
  const queue: string[] = [startUrl];
  const results: CrawledPage[] = [];

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "PrimerBot/1.0 (+https://primer-learn.vercel.app)" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = clean(html);
      if (parsed.text.length > 120) {
        results.push({ url, ...parsed });
      }
      const $: any = cheerio.load(html);
      $("a[href]").each((_: any, el: any) => {
        const href = $(el).attr("href");
        if (!href) return;
        const abs = absolutize(url, href);
        if (abs && sameDomain(startUrl, abs) && !visited.has(abs)) {
          queue.push(abs);
        }
      });
    } catch {
      // skip failures, keep crawling
    }
  }
  return results;
}

export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
