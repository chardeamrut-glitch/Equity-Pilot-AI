import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — EquityPilot AI" },
      { name: "description", content: "Sign in to your EquityPilot AI equity research workspace." },
      { property: "og:title", content: "Sign in — EquityPilot AI" },
      { property: "og:description", content: "Sign in to your EquityPilot AI equity research workspace." },
    ],
  }),
  component: () => <AuthForm mode="login" />,
});
