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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — EquityPilot AI" },
      { name: "description", content: "Sign in to your EquityPilot AI equity research workspace." },
      { property: "og:title", content: "Sign in — EquityPilot AI" },
      { property: "og:description", content: "Sign in to your EquityPilot AI equity research workspace." },
    ],
  }),
  component: () => <AuthForm mode="login" />,
});
