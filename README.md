# Nse Bse Insight Studio

BUILD: AI EQUITY RESEARCH PLATFORM – INDIA MVP

You are a senior SaaS architect, fintech product designer and full-stack developer.

I want to build a real, scalable AI-powered equity research web application.

The product is designed for beginners, MBA finance students, individual investors and professional equity research analysts.

The product's core functionality is:

A user enters an Indian listed company name, uploads five years of financial statements, and receives a complete financial analysis, valuation, investment recommendation and professional 10-slide stock pitch deck.

IMPORTANT: This is a complete MVP development project, not a landing-page-only project.

1. PRODUCT NAME

Use the working product name: EquityPilot AI.

Tagline: Professional Equity Research. Simplified by AI.

The name should be configurable later.

2. TARGET MARKET

Start with Indian publicly listed companies.

Support:

NSE-listed companies

BSE-listed companies

Indian financial reporting

INR currency

Indian financial year conventions

Consolidated and standalone financial statements

Keep the architecture ready for international markets in the future.

3. TECHNOLOGY STACK

Frontend:

React

TypeScript

Tailwind CSS

Reusable UI components

Interactive financial charts

Backend:

Python

FastAPI

REST APIs

Pandas

NumPy

Pydantic

Database and authentication:

Supabase

PostgreSQL

Supabase Auth

Supabase Storage

AI:

LLM API for financial document interpretation, investment research synthesis and explanations.

Structured JSON outputs.

File generation:

Python-pptx for editable PowerPoint presentations.

Openpyxl for Excel financial models.

ReportLab for PDF reports.

Use a separate Python backend service for computationally intensive financial processing.

4. DESIGN REQUIREMENTS

Create a premium institutional financial research interface.

Design inspiration:

Bloomberg Terminal

Koyfin

TradingView

Investment banking research platforms

Use:

White background

Dark navy typography

Subtle blue accents

Clean financial tables

Interactive charts

Professional cards

Responsive layouts

Avoid:

Excessive gradients

Unnecessary animations

Cartoon-like design

Cluttered dashboards

5. APPLICATION PAGES

Build the following pages:

Landing Page

Sign Up

Login

Main Dashboard

Analyse a Company

Financial Statement Upload

Data Validation

Financial Analysis

Valuation Dashboard

Investment Thesis

AI Research Assistant

Pitch Deck Preview

Download Reports

Analysis History

User Settings

6. MAIN USER JOURNEY

The complete user journey should be:

Step 1: User registers or logs in.

Step 2: User enters a company name or ticker.

Step 3: Application identifies the company and confirms the correct exchange and reporting entity.

Step 4: User uploads five years of financial statements.

Step 5: Application extracts the financial data.

Step 6: User reviews extracted information and corrects errors.

Step 7: Application validates the financial statements.

Step 8: Financial analysis engine calculates all ratios and trends.

Step 9: Research engine analyses the business and industry.

Step 10: Valuation engine calculates intrinsic value and price targets.

Step 11: AI generates the investment thesis and recommendation.

Step 12: Application generates a professional 10-slide pitch deck.

Step 13: User previews and downloads the results.

7. DATABASE DESIGN

Create a properly structured PostgreSQL database.

Include the following entities:

users

companies

analyses

uploaded_documents

financial_periods

income_statements

balance_sheets

cash_flow_statements

extracted_financial_metrics

data_validation_results

financial_ratios

valuation_assumptions

valuation_results

investment_theses

research_sources

generated_reports

Each analysis must belong to a user and company.

Each financial statement must be linked to a specific financial year and reporting basis.

Store:

Currency

Units

Financial year

Reporting period

Consolidated or standalone basis

Source document

Extraction status

Validation status

Use appropriate foreign keys, indexes, constraints and Row Level Security.

A user must only access their own private analyses and documents unless a report is explicitly shared.

8. BACKEND API DESIGN

Prepare the following API endpoints:

POST /api/companies/search

POST /api/analyses

POST /api/documents/upload

POST /api/documents/extract

POST /api/financial-data/validate

GET /api/financial-data/{analysis_id}

POST /api/financial-analysis/{analysis_id}/calculate

POST /api/research/{analysis_id}/generate

POST /api/valuation/{analysis_id}/calculate

POST /api/investment-thesis/{analysis_id}/generate

POST /api/pitch-deck/{analysis_id}/generate

GET /api/reports/{analysis_id}

Include authentication, input validation, error handling and proper response schemas.

9. DEVELOPMENT RULES

Do not use fake financial data in actual analyses.

Do not generate random company financial figures.

Never invent current market prices.

Never fabricate research citations.

Use actual data provided by the user or verified external sources.

Store source references for financial inputs.

Keep financial calculations separate from AI-generated interpretations.

Use background jobs for lengthy document processing and report generation.

Display meaningful processing statuses.

Build proper loading, empty and error states.

Make all pages functional.

Do not expose API keys in frontend code.

If an external integration is not configured, clearly show that the feature requires configuration rather than pretending it works.

10. FIRST DEVELOPMENT MILESTONE

For this first task, do NOT attempt to implement the entire application in one response.

First:

Design the complete application architecture.

Create the project structure.

Set up the frontend.

Connect Supabase.

Create the initial database schema.

Implement authentication.

Build the landing page.

Build the dashboard.

Build the company search interface.

Build the financial statement upload interface.

Create the analysis workflow and progress states.

Use realistic sample company names for UI demonstrations, but clearly mark all demo data.

After implementation:

Run the application.

Check all routes.

Check authentication.

Check database access.

Check file upload.

Fix errors.

Report which features are genuinely working and which still require implementation.

Do not claim the MVP is complete until the features have been tested.

Begin by presenting the architecture and implementation plan, then build the first milestone.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b5a66f3a-80a6-5ec9-8948-c596f5d2c74f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
