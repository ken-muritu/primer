// Embeddings: uses Anthropic (or OpenAI-compatible) when ANTHROPIC_API_KEY is
// present, otherwise falls back to a deterministic local hash embedding so the
// app builds and runs with zero external secrets.

const DIM = 384;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

// Deterministic local embedding — stable across processes (no randomness).
function localEmbedding(text: string): number[] {
  const vec = new Array(DIM).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // fold into DIM buckets
    const idx = Math.abs(h) % DIM;
    vec[idx] += 1;
    // second feature from a rotated hash for a little more signal
    const idx2 = Math.abs((h >>> 13) ^ 0x9e3779b9) % DIM;
    vec[idx2] += 0.5;
  }
  // L2 normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both already normalized
}

export async function embed(text: string): Promise<number[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: "voyage-3-lite", input: text }),
      });
      if (r.ok) {
        const data = await r.json();
        return data.data[0].embedding as number[];
      }
    } catch {
      // fall through to local
    }
  }
  return localEmbedding(text);
}

export function embedLocal(text: string): number[] {
  return localEmbedding(text);
}

export function similarity(a: number[], b: number[]): number {
  return cosine(a, b);
}

export function serialize(vec: number[]): string {
  return JSON.stringify(vec);
}

export function deserialize(s: string): number[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const EMBED_DIM = DIM;
export const usingLocalEmbeddings = !process.env.ANTHROPIC_API_KEY;
