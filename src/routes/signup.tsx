import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthForm } from "@/components/auth-form";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/signup")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Create account — EquityPilot AI" },
      { name: "description", content: "Create a free EquityPilot AI account to analyse Indian listed companies." },
      { property: "og:title", content: "Create account — EquityPilot AI" },
      { property: "og:description", content: "Create a free EquityPilot AI account to analyse Indian listed companies." },
    ],
  }),
  component: () => <AuthForm mode="signup" />,
});
