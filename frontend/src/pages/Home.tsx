import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { AIStatus } from "@/lib/ai-types";
import { BookOpen, Database, LockKeyhole, Sparkles, WifiOff } from "lucide-react";

// Hand-written mirror of the StatusCheck Pydantic model in backend/server.py — nothing infers across the HTTP boundary.
const fetchAIStatus = () => apiGet<AIStatus>("/ai/status");

const foundations = [
  { title: "Private profile", detail: "Goals, style, audience, topics, and boundaries stay scoped to one user.", icon: LockKeyhole },
  { title: "Retrieval-ready memory", detail: "Documents, saved writing, and durable memories are chunked for focused context.", icon: Database },
  { title: "Native prompt path", detail: "The current local prompt library remains the offline fallback for the extension.", icon: BookOpen },
];

export default function Home() {
  const status = useQuery({ queryKey: ["ai-status"], queryFn: fetchAIStatus, retry: false });

  return (
    <main data-testid="ai-foundation-page" className="min-h-svh bg-background text-foreground">
      <div className="mx-auto grid min-h-svh max-w-6xl grid-cols-1 gap-12 px-6 py-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-12">
        <section className="flex flex-col justify-between gap-12" data-testid="ai-foundation-main-content">
          <header className="flex items-center justify-between" data-testid="ai-foundation-header">
            <div className="flex items-center gap-3" data-testid="ai-foundation-brand">
              <span className="flex size-9 items-center justify-center rounded-lg bg-foreground text-background" data-testid="ai-foundation-brand-mark"><Sparkles className="size-4" /></span>
              <span className="font-semibold tracking-tight" data-testid="ai-foundation-brand-name">UnoWord</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground" data-testid="ai-foundation-phase-label">Phase 1 foundation</span>
          </header>
          <div className="max-w-2xl" data-testid="ai-foundation-hero">
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" data-testid="ai-foundation-eyebrow">AI Writing Coach</p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl" data-testid="ai-foundation-title">A private context for your next sentence.</h1>
            <p className="mt-5 max-w-xl font-serif text-xl leading-relaxed text-muted-foreground" data-testid="ai-foundation-description">UnoWord uses the information you choose to provide to build a private writing context and personalize future suggestions — without retraining a model on you.</p>
          </div>
          <div className="grid gap-3" data-testid="ai-foundation-feature-list">
            {foundations.map(({ title, detail, icon: Icon }) => (
              <article key={title} className="group flex gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/60" data-testid={`ai-foundation-feature-${title.toLowerCase().replaceAll(" ", "-")}`}>
                <span className="mt-0.5 text-muted-foreground transition-colors group-hover:text-foreground"><Icon className="size-5" /></span>
                <div><h2 className="font-medium tracking-tight" data-testid={`ai-foundation-feature-title-${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground" data-testid={`ai-foundation-feature-detail-${title.toLowerCase().replaceAll(" ", "-")}`}>{detail}</p></div>
              </article>
            ))}
          </div>
        </section>
        <aside className="flex flex-col justify-end" data-testid="ai-foundation-status-column">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-testid="ai-foundation-status-card">
            <div className="flex items-start justify-between gap-4" data-testid="ai-foundation-status-card-header">
              <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground" data-testid="ai-foundation-status-label">System status</p><h2 className="mt-3 text-2xl font-semibold tracking-tight" data-testid="ai-foundation-status-title">Backend boundary</h2></div>
              <span className="rounded-full border border-border p-2 text-muted-foreground" data-testid="ai-foundation-status-icon"><WifiOff className="size-4" /></span>
            </div>
            <div className="mt-8 space-y-4" data-testid="ai-foundation-status-details">
              <div className="flex items-center justify-between border-b border-border pb-4 text-sm"><span className="text-muted-foreground" data-testid="ai-foundation-provider-label">Provider</span><span className="font-mono text-xs" data-testid="ai-foundation-provider-value">{status.data?.provider ?? "checking"}</span></div>
              <div className="flex items-center justify-between border-b border-border pb-4 text-sm"><span className="text-muted-foreground" data-testid="ai-foundation-database-label">Database</span><span className="font-mono text-xs" data-testid="ai-foundation-database-value">{status.data?.database ?? "supabase"}</span></div>
              <div className="flex items-center justify-between border-b border-border pb-4 text-sm"><span className="text-muted-foreground" data-testid="ai-foundation-model-label">Model boundary</span><span className="font-mono text-xs" data-testid="ai-foundation-model-value">{status.data?.model ?? "configurable"}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground" data-testid="ai-foundation-auth-label">Auth</span><span className="font-mono text-xs" data-testid="ai-foundation-auth-value">{status.data?.auth_configured ? "configured" : "not configured"}</span></div>
            </div>
            <p className="mt-7 text-sm leading-relaxed text-muted-foreground" data-testid="ai-foundation-status-message">{status.data?.message ?? "The shell stays usable while the backend is offline or awaiting account integration."}</p>
            <div className="mt-8 rounded-lg bg-muted p-4" data-testid="ai-foundation-preservation-note"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground" data-testid="ai-foundation-preservation-label">Preserved by design</p><p className="mt-2 text-sm leading-relaxed" data-testid="ai-foundation-preservation-text">Word counting, sessions, progress, and the existing local prompt library remain extension-owned and offline-safe.</p></div>
          </div>
        </aside>
      </div>
    </main>
  );
}
