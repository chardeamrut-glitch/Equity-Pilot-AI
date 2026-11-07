# EquityPilot AI — Architecture (Milestone 1)

Frontend: TanStack Start (React 19, TypeScript, Tailwind v4). Backend: Lovable Cloud (Postgres, Auth, Storage) + TanStack server functions.

## Journey → stages (analyses.stage)
company_selected → documents_uploaded → extracted → validated → analysed → researched → valued → thesis_generated → deck_generated

## API mapping (server functions)
| Spec endpoint | Status |
|---|---|
| POST /api/companies/search | `searchCompanies` — done |
| POST /api/analyses | `createAnalysis` — done |
| POST /api/documents/upload | direct private-storage upload + `uploaded_documents` row (RLS) — done |
| POST /api/documents/extract | next milestone (AI extraction, background job) |
| POST /api/financial-data/validate, GET /api/financial-data/{id} | next |
| POST /api/financial-analysis/{id}/calculate | next (deterministic TS engine) |
| POST /api/research, /valuation, /investment-thesis, /pitch-deck | later |
| GET /api/reports/{id} | later |

## Data model
profiles, companies (identification only), analyses, uploaded_documents, financial_periods, income_statements, balance_sheets, cash_flow_statements, extracted_financial_metrics, data_validation_results, financial_ratios, valuation_assumptions, valuation_results, investment_theses, research_sources, generated_reports. All child tables are owner-only via RLS; `analyses.is_shared` grants read access.
