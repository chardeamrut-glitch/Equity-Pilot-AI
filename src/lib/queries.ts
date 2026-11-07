import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const analysesQuery = () =>
  queryOptions({
    queryKey: ["analyses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("id,title,stage,status,reporting_basis,units,start_fy,end_fy,created_at,updated_at,companies(name,nse_symbol,bse_code,exchange,sector)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

export const analysisQuery = (id: string) =>
  queryOptions({
    queryKey: ["analysis", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analyses")
        .select("*,companies(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const documentsQuery = (analysisId: string) =>
  queryOptions({
    queryKey: ["documents", analysisId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("uploaded_documents")
        .select("*")
        .eq("analysis_id", analysisId)
        .order("fiscal_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
