import { getClient } from "@/lib/db";

export const dynamic = "force-dynamic";

async function listSpaces() {
  try {
    const client = await getClient();
    const rows = await client.execute({
      sql: `SELECT id, title, source_url, status, version_label, last_synced, created_at FROM spaces ORDER BY created_at DESC LIMIT 50`,
      args: [],
    });
    return rows.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      sourceUrl: r.source_url as string,
      status: r.status as string,
      versionLabel: r.version_label as string,
      lastSynced: r.last_synced as string,
      createdAt: r.created_at as string,
    }));
  } catch {
    return [];
  }
}

export default async function SpacesPage() {
  const spaces = await listSpaces();
  return (
    <section style={{ paddingTop: 8 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>Your Spaces</h1>
      <p style={{ color: "var(--muted)", marginTop: 8, marginBottom: 0 }}>
        Every ingested documentation set lives here as a shareable Space.
      </p>
      {spaces.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>
          No Spaces yet. <a href="/" style={{ color: "var(--forest)" }}>Create your first one</a>
        </div>
      ) : (
        <div className="space-grid" style={{ marginTop: 18 }}>
          {spaces.map((s) => (
            <a key={s.id} href={`/spaces/${s.id}`} className="card space-tile">
              <div className="name">{s.title} <span className="pill-ready">{s.status}</span></div>
              <div className="url">{s.sourceUrl}</div>
              {s.versionLabel && <div className="meta">version {s.versionLabel} · synced {s.lastSynced}</div>}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
