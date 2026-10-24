"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function PublicSpaces() {
  const [spaces, setSpaces] = useState<any[]>([]);
  useState(() => {
    fetch("/api/spaces/public")
      .then((r) => r.json())
      .then((d) => setSpaces(d.spaces || []))
      .catch(() => {});
  });
  if (!spaces.length) return null;
  return (
    <div className="space-grid">
      {spaces.map((s) => (
        <a key={s.id} href={`/spaces/${s.id}`} className="card space-tile">
          <div className="name">{s.title} <span className="pill-ready">Ready</span></div>
          <div className="url">{s.sourceUrl}</div>
          <div className="meta">{s.pageCount || 0} pages indexed</div>
        </a>
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function createSpace() {
    setError(null);
    setStatus(null);
    if (!/^https?:\/\//.test(url.trim())) {
      setError("Please paste a valid http(s) documentation URL.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl: url.trim(), title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setStatus(data.reused ? "Already built — opening your Space…" : "Space queued. We'll ingest the docs and open it now…");
      router.push(`/spaces/${data.id}`);
    } catch (e: any) { setError(e?.message || "Network error."); setLoading(false); }
  }

  return (
    <section>
      <div className="hero">
        <span className="badge"><span className="spark">✦</span> One ingestion, two ways to learn</span>
        <h1>Learn any tool, straight from its own docs.</h1>
        <p className="lead">
          Paste a documentation URL. Primer reads it, then gives you a chat that only answers
          with citations — and a lesson path with quizzes, XP and streaks.
        </p>

        <div className="card" style={{ marginTop: 28, maxWidth: 720 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Documentation URL</label>
              <input className="input" style={{ marginTop: 6 }} placeholder="https://docs.stripe.com" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Space name</label>
              <input className="input" style={{ marginTop: 6 }} placeholder="Optional" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={createSpace} disabled={loading}>
            {loading ? "Creating Space…" : "Sign in to build →"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Public pages only, up to 60 pages per Space. Lessons paraphrase and always link back to the source.
          </p>
          {error && <p className="banner err" style={{ marginTop: 12, marginBottom: 0 }}>{error}</p>}
          {status && <p className="banner" style={{ marginTop: 12, marginBottom: 0 }}>{status}</p>}
        </div>
      </div>

      <div className="features">
        <div className="card feature">
          <div className="ic">💬</div>
          <h3>Cited chat</h3>
          <p>Every answer points at the exact doc page it came from. No invented APIs.</p>
        </div>
        <div className="card feature">
          <div className="ic">✦</div>
          <h3>Bite-sized lessons</h3>
          <p>Auto-built lesson path with a 5-question quiz each. XP and daily streaks.</p>
        </div>
        <div className="card feature">
          <div className="ic">🌐</div>
          <h3>Shareable Spaces</h3>
          <p>Send the link. Nobody re-crawls the same docs twice.</p>
        </div>
      </div>

      <h2 className="section-title">Public Spaces</h2>
      <p className="section-sub">Already ingested — jump straight in.</p>
      <PublicSpaces />
    </section>
  );
}
