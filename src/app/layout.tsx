import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Primer — Learn any tool from its own docs",
  description:
    "Paste a documentation URL. Primer reads it, then gives you a chat that only answers with citations — and a lesson path with quizzes, XP and streaks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="container nav">
          <a href="/" className="brand">
            <span className="dot">P</span>
            Primer
          </a>
          <a href="/spaces" className="btn btn-forest" style={{ padding: "9px 18px", fontSize: 14 }}>
            My Spaces
          </a>
        </header>
        <main className="container">{children}</main>
        <footer className="container" style={{ padding: "40px 24px 56px", color: "var(--muted)", fontSize: 13 }}>
          One ingestion, two ways to learn · Public pages only · Lessons paraphrase and always link back to the source.
        </footer>
      </body>
    </html>
  );
}
