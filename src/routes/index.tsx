import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, FileSearch, Presentation, ShieldCheck, Upload, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoBadge, Logo } from "@/components/brand";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} — AI equity research for Indian stocks` },
      { name: "description", content: "Upload five years of statements for any NSE/BSE company and get ratio analysis, valuation, an investment thesis and a 10-slide pitch deck." },
      { property: "og:title", content: `${APP_NAME} — AI equity research for Indian stocks` },
      { property: "og:description", content: "Ratio analysis, valuation, thesis and pitch deck for NSE/BSE companies — from your own statements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const STEPS = [
  { icon: FileSearch, t: "Identify the company", d: "Search NSE/BSE by name, symbol, BSE code or ISIN and confirm the reporting entity." },
  { icon: Upload, t: "Upload 5 years", d: "Annual reports or statements — consolidated or standalone, in ₹ crore or lakh." },
  { icon: ShieldCheck, t: "Review & validate", d: "Every extracted figure is editable and traced back to its source page." },
  { icon: BarChart3, t: "Analyse", d: "Growth, margins, returns, leverage and cash conversion across five years." },
  { icon: Scale, t: "Value", d: "DCF and relative valuation with transparent, editable assumptions." },
  { icon: Presentation, t: "Pitch", d: "Investment thesis and an editable 10-slide deck, Excel model and PDF." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/login">Sign in</Link></Button>
            <Button asChild variant="navy" size="sm"><Link to="/signup">Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="border-b bg-grid">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
          <div>
            <div className="eyebrow">NSE · BSE · INR · Indian FY</div>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.1] text-navy sm:text-5xl">{APP_TAGLINE}</h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Enter an Indian listed company, upload five years of financial statements, and get a complete analysis, valuation, recommendation and a professional 10-slide stock pitch.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="navy" size="lg"><Link to="/signup">Start an analysis <ArrowRight /></Link></Button>
              <Button asChild variant="outline" size="lg"><Link to="/login">Sign in</Link></Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">For beginners, MBA finance students, individual investors and research analysts.</p>
          </div>

          <div className="rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="font-mono text-xs">TITAN · NSE · Consolidated</span>
              <DemoBadge label="Demo layout · no real figures" />
            </div>
            <div className="grid grid-cols-3 divide-x border-b">
              {["Revenue CAGR", "ROCE", "Intrinsic value"].map((k) => (
                <div key={k} className="p-4">
                  <div className="eyebrow">{k}</div>
                  <div className="mt-1 font-mono text-lg text-muted-foreground">— —</div>
                </div>
              ))}
            </div>
            <div className="flex h-40 items-end gap-3 px-6 pb-4 pt-6">
              {[38, 46, 52, 63, 74].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-sm bg-primary/20" style={{ height: `${h}%` }} />
                  <span className="font-mono text-[10px] text-muted-foreground">FY{21 + i}</span>
                </div>
              ))}
            </div>
            <div className="border-t px-4 py-2.5 text-xs text-muted-foreground">Placeholder bars — figures appear only from statements you upload.</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="eyebrow">Workflow</div>
        <h2 className="mt-2 text-2xl font-semibold text-navy">From annual report to pitch deck</h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="bg-card p-6">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/50">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
          {[
            ["No invented numbers", "Analyses only use figures you upload or verified sources. Market prices are never fabricated."],
            ["Maths separate from AI", "Ratios and valuations are computed deterministically. AI writes the interpretation — and says so."],
            ["Private by default", "Your documents and analyses are visible only to you unless you choose to share."],
          ].map(([t, d]) => (
            <div key={t}>
              <h3 className="font-semibold text-navy">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} {APP_NAME}</span>
        <span>Educational research tool. Not investment advice. Not SEBI-registered research.</span>
      </footer>
    </div>
  );
}
