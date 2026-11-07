import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — EquityPilot AI" }, { name: "description", content: "Manage your profile." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const profile = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [form, setForm] = useState({ full_name: "", organisation: "", user_type: "investor" });
  useEffect(() => {
    if (profile.data) setForm({ full_name: profile.data.full_name ?? "", organisation: profile.data.organisation ?? "", user_type: profile.data.user_type ?? "investor" });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").upsert({ id: user.id, ...form });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profile saved"),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Account" title="Settings" />
      <Card className="space-y-4 p-6">
        <div className="space-y-1.5"><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
        <div className="space-y-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Organisation / institute</Label><Input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>I am a…</Label>
          <Select value={form.user_type} onValueChange={(v) => setForm({ ...form, user_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner investor</SelectItem>
              <SelectItem value="student">MBA / finance student</SelectItem>
              <SelectItem value="investor">Individual investor</SelectItem>
              <SelectItem value="analyst">Professional analyst</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="navy" onClick={() => save.mutate()} disabled={save.isPending || profile.isLoading}>Save changes</Button>
      </Card>
    </div>
  );
}
