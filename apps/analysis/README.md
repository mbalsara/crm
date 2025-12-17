# Analysis Service

Email analysis service for CRM platform. Handles domain extraction, contact extraction, signature parsing, sentiment analysis, and business signal detection.

## Features

- **Domain Extraction**: Extract and identify company domains from emails
- **Contact Extraction**: Extract contacts and link to customers
- **Signature Parsing**: Parse email signatures using regex + LLM (conditional)
- **Email Analysis**: Sentiment analysis and business signal detection (escalation, upsell, churn, kudos, competitor)
- **LLM Integration**: Vercel AI SDK with Langfuse observability
- **Independent Sub-Workflows**: Each analysis runs as independent Inngest function

## Architecture

- **Framework**: Hono (lightweight web framework)
- **Dependency Injection**: tsyringe
- **LLM**: Vercel AI SDK (OpenAI, Anthropic)
- **Observability**: Langfuse
- **Async Processing**: Inngest

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test
```

## Environment Variables

```env
# Server
PORT=4002
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...

# LLM Providers
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...


# Langfuse
LANGFUSE_SECRET_KEY=...
LANGFUSE_PUBLIC_KEY=...
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/analysis/domain-extract` - Extract domains from email and create customers
- `POST /api/analysis/contact-extract` - Extract contacts from email and create them
- `POST /api/analysis/analyze` - Analyze email (coming soon)
- `GET /api/analysis/config` - Get analysis configuration (coming soon)

**Note**: Domain enrichment via Clearbit/Hunter.io is being explored as an optional paid feature. See `docs/DOMAIN_ENRICHMENT_OPTIONS.md` for provider comparison.

## Project Structure

```
apps/analysis/
├── src/
│   ├── index.ts                 # Entry point
│   ├── routes/                  # API routes
│   │   └── analysis.ts
│   ├── services/               # Business logic
│   │   ├── domain-extraction.ts
│   │   ├── contact-extraction.ts
│   │   ├── signature-parsing.ts
│   │   └── email-analysis.ts
│   ├── framework/              # Analysis framework
│   │   ├── registry.ts         # Analysis registry
│   │   └── executor.ts         # Analysis executor
│   ├── analyses/               # Analysis definitions
│   │   └── definitions.ts
│   ├── llm/                    # LLM integration
│   │   └── client.ts
│   ├── di/                     # Dependency injection
│   │   └── container.ts
│   └── utils/                  # Utilities
│       └── logger.ts
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

## Related Documentation

- [Email Analysis Design](../../docs/EMAIL_ANALYSIS_DESIGN.md)
- [Analysis Framework Design](../../docs/ANALYSIS_FRAMEWORK_DESIGN.md)
- [Analysis Implementation Guide](../../docs/EMAIL_ANALYSIS_IMPLEMENTATION.md)
- [Analysis Decisions Summary](../../docs/ANALYSIS_DECISIONS_SUMMARY.md)
- [Domain Enrichment Options](../../docs/DOMAIN_ENRICHMENT_OPTIONS.md)
