"use client";

import { useEffect, useRef, useState } from "react";

type Lesson = {
  id: string; title: string; order: number; contentJson: any;
  quiz: { question: string; options: string[]; correctIndex: number }[];
};
type SpaceMeta = {
  id: string; title: string; sourceUrl: string; status: string;
  versionLabel: string | null; lastSynced: string | null; lessonCount: number; pageCount: number;
};

const STATUS_COPY: Record<string, string> = {
  pending: "Queued for ingestion…", queued: "Queued for ingestion…",
  ingesting: "Ingesting docs…", running: "Ingesting docs…", ready: "Ready", failed: "Ingestion failed",
};

export default function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const [spaceId, setSpaceId] = useState("");
  const [meta, setMeta] = useState<SpaceMeta | null>(null);
  const [tab, setTab] = useState<"chat" | "course">("chat");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shareUrl, setShareUrl] = useState("");
  const triggered = useRef(false);

  useEffect(() => {
    (async () => {
      const p = await params;
      setSpaceId(p.id);
      setShareUrl(`${window.location.origin}/spaces/${p.id}`);
    })();
  }, [params]);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/spaces/${spaceId}`);
        const d = await r.json();
        if (!active) return;
        setMeta(d);
        if (d.status !== "ready" && d.status !== "failed" && !triggered.current) {
          triggered.current = true;
          fetch(`/api/spaces/${spaceId}/ingest`, { method: "POST" }).catch(() => {});
        }
      } catch {}
      if (active && meta?.status !== "ready" && meta?.status !== "failed") setTimeout(tick, 2500);
    };
    tick();
    return () => { active = false; };
  }, [spaceId, meta?.status]);

  async function loadLessons() {
    const r = await fetch(`/api/spaces/${spaceId}/lessons`);
    const d = await r.json();
    setLessons(d.lessons || []);
  }

  if (!meta) return <div style={{ paddingTop: 40, color: "var(--muted)" }}>Loading…</div>;
  const busy = meta.status !== "ready" && meta.status !== "failed";

  return (
    <section>
      <div className="space-head">
        <div>
          <h1>{meta.title}</h1>
          <a className="src" href={meta.sourceUrl} target="_blank" rel="noreferrer">{meta.sourceUrl}</a>
          <div className="stat">
            {meta.pageCount || 0} pages · {meta.lessonCount || 0} lessons indexed
            {meta.versionLabel ? ` · v${meta.versionLabel}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="stat-pill" onClick={() => { navigator.clipboard?.writeText(shareUrl); }} title="Copy share link">
            🔗 <span>Share</span>
          </button>
          <span className="stat-pill">{xp} <span className="lbl">XP</span></span>
          <span className="stat-pill">🔥 {streak} <span className="lbl">streak</span></span>
        </div>
      </div>

      {busy && <div className="banner">{STATUS_COPY[meta.status] || "Working…"} ({meta.pageCount || 0} pages so far)</div>}
      {meta.status === "failed" && (
        <div className="banner err">Ingestion failed — the docs may be unreachable or JS-rendered. Retry by re-pasting the URL.</div>
      )}

      <div className="tabs">
        <button className={tab === "chat" ? "tab active" : "tab"} onClick={() => setTab("chat")} disabled={busy}>💬 Chat</button>
        <button className={tab === "course" ? "tab active" : "tab"} onClick={() => { setTab("course"); loadLessons(); }} disabled={busy}>✦ Learn</button>
      </div>

      <div style={{ marginTop: 8 }}>
        {tab === "chat" ? <ChatPanel spaceId={spaceId} /> :
          <CoursePanel spaceId={spaceId} lessons={lessons} onLoad={loadLessons} onComplete={(e) => { setXp((x) => x + e); setStreak((s) => Math.max(s, 1)); }} />}
      </div>
    </section>
  );
}

function ChatPanel({ spaceId }: { spaceId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string; citations?: any[] }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const SUGGESTIONS = ["What is this for?", "How do I get started?", "What are the main concepts?"];

  async function ask(question?: string) {
    const text = (question ?? q).trim();
    if (!text || busy) return;
    setBusy(true); setQ("");
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/chat`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "ai", text: data.text || "(no answer)", citations: data.citations || [] }]);
    } catch { setMessages((m) => [...m, { role: "ai", text: "Chat failed. Try again." }]); }
    finally { setBusy(false); }
  }

  return (
    <div className="chat-card">
      {messages.length === 0 ? (
        <>
          <div className="chat-empty">Ask anything about these docs. Answers come only from the crawled pages, with links back to the source.</div>
          <div className="chips">
            {SUGGESTIONS.map((s) => (<button key={s} className="chip" onClick={() => ask(s)}>{s}</button>))}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.text}
                {m.citations && m.citations.length > 0 && (
                  <div className="cites">
                    {m.citations.map((c, ci) => (
                      <a key={ci} href={c.url || "#"} target="_blank" rel="noreferrer">
                        [{ci + 1}] {c.title || c.section || c.url || "source"}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      <div className="inputbar">
        <input className="input" placeholder="Ask these docs anything…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
        <button className="send" onClick={() => ask()} disabled={busy}>➤</button>
      </div>
    </div>
  );
}

function CoursePanel({ spaceId, lessons, onLoad, onComplete }: { spaceId: string; lessons: Lesson[]; onLoad: () => void; onComplete: (xp: number) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const [gen, setGen] = useState<"idle" | "loading">("idle");
  async function generate() {
    setGen("loading");
    await fetch(`/api/spaces/${spaceId}/lessons`, { method: "POST" }).catch(() => {});
    await onLoad(); setGen("idle");
  }
  if (lessons.length === 0) {
    return (
      <div className="card" style={{ marginTop: 20, color: "var(--muted)", textAlign: "center" }}>
        {gen === "loading" ? "Generating course from the docs…" : (
          <>No course yet. <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={generate}>Generate course</button></>
        )}
      </div>
    );
  }
  if (active === null) {
    return (
      <div className="lesson-list" style={{ marginTop: 20 }}>
        {lessons.map((l, i) => (
          <button key={l.id} className="card lesson-row" style={{ textAlign: "left", cursor: "pointer", width: "100%" }} onClick={() => setActive(i)}>
            <span className="lt">{i + 1}. {l.title}</span>
            <span style={{ color: "var(--forest)" }}>Start →</span>
          </button>
        ))}
      </div>
    );
  }
  return <Quiz lesson={lessons[active]} spaceId={spaceId} onDone={(e) => { onComplete(e); setActive(null); }} onBack={() => setActive(null)} />;
}

function Quiz({ lesson, spaceId, onDone, onBack }: { lesson: Lesson; spaceId: string; onDone: (xp: number) => void; onBack: () => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(lesson.quiz.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const correct = answers.filter((a, i) => a === lesson.quiz[i].correctIndex).length;
  const allAnswered = answers.every((a) => a !== null);
  async function submit() {
    setSubmitted(true);
    const earned = Math.round((correct / lesson.quiz.length) * 50) + 10;
    await fetch(`/api/spaces/${spaceId}/complete`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId: lesson.id, xp: earned }),
    }).catch(() => {});
    onDone(earned);
  }
  return (
    <div className="card" style={{ marginTop: 20 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, marginBottom: 12 }}>← Back to course</button>
      <h3 style={{ margin: "0 0 4px", fontSize: 20 }}>{lesson.title}</h3>
      <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 18 }}>{lesson.contentJson?.summary}</div>
      <div style={{ display: "grid", gap: 16 }}>
        {lesson.quiz.map((qq, qi) => (
          <div key={qi} className="quiz-q">
            <div style={{ fontWeight: 600, marginBottom: 10 }}>{qi + 1}. {qq.question}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {qq.options.map((opt, oi) => {
                const chosen = answers[qi] === oi;
                const isCorrect = qq.correctIndex === oi;
                let cls = "opt";
                if (submitted) { if (isCorrect) cls += " correct"; else if (chosen) cls += " wrong"; }
                else if (chosen) cls += " correct";
                return (
                  <button key={oi} className={cls} disabled={submitted} onClick={() => { const n = [...answers]; n[qi] = oi; setAnswers(n); }}>{opt}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!submitted ? (
        <button className="btn btn-primary" style={{ marginTop: 20, width: "100%" }} disabled={!allAnswered} onClick={submit}>
          {allAnswered ? "Submit quiz" : "Answer all questions"}
        </button>
      ) : (
        <div className="banner" style={{ marginTop: 18, textAlign: "center" }}>
          <strong>You scored {correct}/{lesson.quiz.length}</strong> · Earned XP for this lesson.
        </div>
      )}
    </div>
  );
}
