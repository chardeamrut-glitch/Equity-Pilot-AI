
-- ENUMS
CREATE TYPE public.exchange_code AS ENUM ('NSE','BSE','BOTH');
CREATE TYPE public.reporting_basis AS ENUM ('consolidated','standalone');
CREATE TYPE public.statement_type AS ENUM ('income_statement','balance_sheet','cash_flow','annual_report','other');
CREATE TYPE public.processing_status AS ENUM ('pending','processing','completed','failed','not_configured');
CREATE TYPE public.analysis_stage AS ENUM ('company_selected','documents_uploaded','extracted','validated','analysed','researched','valued','thesis_generated','deck_generated');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES (users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  user_type text CHECK (user_type IN ('beginner','student','investor','analyst')),
  organisation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- COMPANIES (shared reference directory; identification only, no financials)
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  nse_symbol text UNIQUE,
  bse_code text UNIQUE,
  isin text UNIQUE,
  exchange public.exchange_code NOT NULL DEFAULT 'NSE',
  sector text,
  industry text,
  country text NOT NULL DEFAULT 'IN',
  currency text NOT NULL DEFAULT 'INR',
  fy_end_month smallint NOT NULL DEFAULT 3 CHECK (fy_end_month BETWEEN 1 AND 12),
  source text NOT NULL DEFAULT 'manual',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_name_idx ON public.companies (lower(name));
GRANT SELECT, INSERT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies readable" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "companies add" ON public.companies FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND source = 'user_added');

-- ANALYSES
CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  reporting_basis public.reporting_basis NOT NULL DEFAULT 'consolidated',
  currency text NOT NULL DEFAULT 'INR',
  units text NOT NULL DEFAULT 'crore' CHECK (units IN ('crore','lakh','million','thousand','absolute')),
  start_fy smallint,
  end_fy smallint,
  stage public.analysis_stage NOT NULL DEFAULT 'company_selected',
  status public.processing_status NOT NULL DEFAULT 'pending',
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analyses_user_idx ON public.analyses (user_id, created_at DESC);
CREATE INDEX analyses_company_idx ON public.analyses (company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own analyses select" ON public.analyses FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_shared);
CREATE POLICY "own analyses insert" ON public.analyses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own analyses update" ON public.analyses FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own analyses delete" ON public.analyses FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER analyses_updated BEFORE UPDATE ON public.analyses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.owns_analysis(_analysis_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.analyses WHERE id = _analysis_id AND user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.can_read_analysis(_analysis_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.analyses WHERE id = _analysis_id AND (user_id = auth.uid() OR is_shared));
$$;

-- UPLOADED DOCUMENTS
CREATE TABLE public.uploaded_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fiscal_year smallint NOT NULL CHECK (fiscal_year BETWEEN 1990 AND 2100),
  statement_type public.statement_type NOT NULL,
  reporting_basis public.reporting_basis NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text,
  size_bytes bigint,
  extraction_status public.processing_status NOT NULL DEFAULT 'pending',
  extraction_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uploaded_documents_analysis_idx ON public.uploaded_documents (analysis_id);

-- FINANCIAL PERIODS
CREATE TABLE public.financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  fiscal_year smallint NOT NULL,
  period_label text NOT NULL,
  period_start date,
  period_end date,
  reporting_basis public.reporting_basis NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  units text NOT NULL DEFAULT 'crore',
  source_document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE SET NULL,
  validation_status public.processing_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, fiscal_year, reporting_basis)
);

CREATE TABLE public.income_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL UNIQUE REFERENCES public.financial_periods(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  revenue numeric, other_income numeric, total_income numeric, cost_of_materials numeric,
  employee_expenses numeric, other_expenses numeric, ebitda numeric, depreciation numeric,
  ebit numeric, finance_costs numeric, exceptional_items numeric, profit_before_tax numeric,
  tax_expense numeric, net_profit numeric, minority_interest numeric, eps_basic numeric, eps_diluted numeric,
  source_document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE SET NULL,
  is_user_corrected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.balance_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL UNIQUE REFERENCES public.financial_periods(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  share_capital numeric, reserves numeric, total_equity numeric, minority_interest numeric,
  long_term_borrowings numeric, short_term_borrowings numeric, total_debt numeric,
  trade_payables numeric, other_liabilities numeric, total_liabilities numeric,
  fixed_assets numeric, cwip numeric, investments numeric, inventories numeric,
  trade_receivables numeric, cash_and_equivalents numeric, other_assets numeric, total_assets numeric,
  shares_outstanding numeric,
  source_document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE SET NULL,
  is_user_corrected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cash_flow_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL UNIQUE REFERENCES public.financial_periods(id) ON DELETE CASCADE,
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  cash_from_operations numeric, capex numeric, cash_from_investing numeric,
  cash_from_financing numeric, dividends_paid numeric, free_cash_flow numeric, net_change_in_cash numeric,
  source_document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE SET NULL,
  is_user_corrected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.extracted_financial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.uploaded_documents(id) ON DELETE CASCADE,
  fiscal_year smallint NOT NULL,
  metric_key text NOT NULL,
  raw_label text,
  value numeric,
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  page_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX efm_analysis_idx ON public.extracted_financial_metrics (analysis_id, fiscal_year);
CREATE TABLE public.data_validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  fiscal_year smallint,
  rule_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info','warning','error')),
  message text NOT NULL,
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.financial_ratios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  fiscal_year smallint NOT NULL,
  category text NOT NULL CHECK (category IN ('growth','profitability','efficiency','liquidity','leverage','cash_flow','valuation','returns')),
  ratio_key text NOT NULL,
  value numeric,
  formula text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, fiscal_year, ratio_key)
);
CREATE TABLE public.valuation_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('dcf','relative','ddm','sotp')),
  key text NOT NULL,
  value numeric,
  rationale text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (analysis_id, method, key)
);
CREATE TABLE public.valuation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  method text NOT NULL,
  intrinsic_value_per_share numeric,
  bear_value numeric, base_value numeric, bull_value numeric,
  market_price numeric,
  market_price_source text,
  market_price_as_of timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.investment_theses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  recommendation text CHECK (recommendation IN ('BUY','ACCUMULATE','HOLD','REDUCE','SELL')),
  target_price numeric,
  summary text,
  thesis jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  publisher text,
  published_at date,
  source_type text NOT NULL CHECK (source_type IN ('user_document','filing','exchange','news','industry_report','other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.generated_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('pitch_deck_pptx','excel_model','pdf_report')),
  storage_path text,
  status public.processing_status NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants + RLS for analysis-child tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['uploaded_documents','financial_periods','income_statements','balance_sheets','cash_flow_statements','extracted_financial_metrics','data_validation_results','financial_ratios','valuation_assumptions','valuation_results','investment_theses','research_sources','generated_reports']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read via analysis" ON public.%I FOR SELECT TO authenticated USING (public.can_read_analysis(analysis_id))', t);
    EXECUTE format('CREATE POLICY "insert via analysis" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.owns_analysis(analysis_id))', t);
    EXECUTE format('CREATE POLICY "update via analysis" ON public.%I FOR UPDATE TO authenticated USING (public.owns_analysis(analysis_id))', t);
    EXECUTE format('CREATE POLICY "delete via analysis" ON public.%I FOR DELETE TO authenticated USING (public.owns_analysis(analysis_id))', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (analysis_id)', t || '_analysis_id_idx', t);
  END LOOP;
END $$;

-- Company directory seed: identification data only (names/symbols/ISIN), no financials.
INSERT INTO public.companies (name, nse_symbol, bse_code, isin, exchange, sector, industry, source) VALUES
('Reliance Industries Ltd','RELIANCE','500325','INE002A01018','BOTH','Energy','Oil, Gas & Consumable Fuels','seed_directory'),
('Tata Consultancy Services Ltd','TCS','532540','INE467B01029','BOTH','Information Technology','IT Services','seed_directory'),
('Infosys Ltd','INFY','500209','INE009A01021','BOTH','Information Technology','IT Services','seed_directory'),
('HDFC Bank Ltd','HDFCBANK','500180','INE040A01034','BOTH','Financials','Banks','seed_directory'),
('ICICI Bank Ltd','ICICIBANK','532174','INE090A01021','BOTH','Financials','Banks','seed_directory'),
('Hindustan Unilever Ltd','HINDUNILVR','500696','INE030A01027','BOTH','Consumer Staples','FMCG','seed_directory'),
('ITC Ltd','ITC','500875','INE154A01025','BOTH','Consumer Staples','FMCG','seed_directory'),
('Larsen & Toubro Ltd','LT','500510','INE018A01030','BOTH','Industrials','Construction & Engineering','seed_directory'),
('Asian Paints Ltd','ASIANPAINT','500820','INE021A01026','BOTH','Materials','Paints','seed_directory'),
('Maruti Suzuki India Ltd','MARUTI','532500','INE585B01010','BOTH','Consumer Discretionary','Automobiles','seed_directory'),
('Bharti Airtel Ltd','BHARTIARTL','532454','INE397D01024','BOTH','Communication Services','Telecom','seed_directory'),
('Sun Pharmaceutical Industries Ltd','SUNPHARMA','524715','INE044A01036','BOTH','Health Care','Pharmaceuticals','seed_directory'),
('Titan Company Ltd','TITAN','500114','INE280A01028','BOTH','Consumer Discretionary','Jewellery & Watches','seed_directory'),
('Bajaj Finance Ltd','BAJFINANCE','500034','INE296A01024','BOTH','Financials','NBFC','seed_directory'),
('Pidilite Industries Ltd','PIDILITIND','500331','INE318A01026','BOTH','Materials','Specialty Chemicals','seed_directory');
