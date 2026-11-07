
ALTER TABLE public.uploaded_documents
  ADD COLUMN detected_currency text,
  ADD COLUMN detected_units text,
  ADD COLUMN detected_basis public.reporting_basis,
  ADD COLUMN detected_fiscal_years smallint[] NOT NULL DEFAULT '{}',
  ADD COLUMN extraction_method text,
  ADD COLUMN page_count integer,
  ADD COLUMN extracted_at timestamptz;

ALTER TABLE public.extracted_financial_metrics
  ADD COLUMN statement text NOT NULL DEFAULT 'income_statement' CHECK (statement IN ('income_statement','balance_sheet','cash_flow')),
  ADD COLUMN source_unit text,
  ADD COLUMN original_value numeric,
  ADD COLUMN normalized_value numeric,
  ADD COLUMN is_user_corrected boolean NOT NULL DEFAULT false,
  ADD COLUMN review_status text NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('high_confidence','needs_review','confirmed','corrected','rejected')),
  ADD COLUMN flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN reviewed_at timestamptz;

CREATE INDEX efm_doc_idx ON public.extracted_financial_metrics (document_id);
