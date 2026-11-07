import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand";

const GOOGLE_SVG = (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
);

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/login" });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between border-r bg-navy p-10 text-navy-foreground max-lg:hidden">
        <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-70">EquityPilot AI · India</span>
        <div>
          <p className="font-display text-3xl leading-snug">
            “Every number traceable to a source. Every view separated from the arithmetic.”
          </p>
          <p className="mt-4 text-sm opacity-70">Research workflow for NSE & BSE listed companies.</p>
        </div>
        <span className="font-mono text-xs opacity-50">Not investment advice.</span>
      </div>
      <div className="flex flex-col p-6 sm:p-10">
        <Logo />
        <div className="m-auto w-full max-w-sm py-10">
          {sent ? (
            <div>
              <h1 className="text-2xl font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to activate your account.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">{mode === "login" ? "Sign in" : "Create your account"}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "login" ? "Welcome back." : "Start your first company analysis in minutes."}
              </p>
              <button
                type="button"
                onClick={google}
                className="mt-6 flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                {GOOGLE_SVG} Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={submit} className="space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" variant="navy" className="w-full" disabled={busy}>
                  {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
                </Button>
              </form>
              <p className="mt-6 text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>No account? <Link to="/signup" className="font-medium text-primary hover:underline">Sign up</Link></>
                ) : (
                  <>Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link></>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
