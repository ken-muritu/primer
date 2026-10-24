// LLM helper. Uses Anthropic Claude when ANTHROPIC_API_KEY is set; otherwise
// returns null and callers fall back to deterministic local generators.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function complete(
  system: string,
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-0",
        max_tokens: opts.maxTokens ?? 1024,
        system,
        temperature: opts.temperature ?? 0.2,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data.content?.[0]?.text as string) ?? null;
  } catch {
    return null;
  }
}

export const usingLocalLLM = !process.env.ANTHROPIC_API_KEY;
