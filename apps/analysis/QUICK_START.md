# Quick Start - Analysis API

## Simple Curl Example

```bash
curl -X POST http://localhost:4002/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "123e4567-e89b-12d3-a456-426614174000",
    "email": {
      "provider": "gmail",
      "messageId": "msg-123",
      "threadId": "thread-456",
      "subject": "Great Service!",
      "body": "I am very happy with your service!",
      "from": {
        "email": "customer@example.com",
        "name": "John Doe"
      },
      "tos": [
        {
          "email": "support@company.com"
        }
      ],
      "ccs": [],
      "bccs": [],
      "receivedAt": "2024-01-15T10:30:00Z"
    },
    "analysisTypes": ["sentiment", "kudos"]
  }'
```

## How to Specify Analyses

**Option 1: Specify analysis types explicitly (recommended)**

```json
{
  "analysisTypes": ["sentiment", "escalation", "upsell", "churn", "kudos", "competitor"]
}
```

**Option 2: Use config to enable analyses**

```json
{
  "config": {
    "enabledAnalyses": {
      "sentiment": true,
      "escalation": true,
      "upsell": false
    }
  }
}
```

If `analysisTypes` is not provided, it uses `config.enabledAnalyses` (defaults to all false except domain/contact extraction).

## With Thread Context

For analyses that require thread context (`escalation`, `churn`), provide `threadContext`:

```bash
curl -X POST http://localhost:4002/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "123e4567-e89b-12d3-a456-426614174000",
    "email": {
      "provider": "gmail",
      "messageId": "msg-123",
      "threadId": "thread-456",
      "subject": "Re: Issue",
      "body": "This is the third time I am contacting you.",
      "from": {
        "email": "customer@example.com"
      },
      "tos": [{"email": "support@company.com"}],
      "ccs": [],
      "bccs": [],
      "receivedAt": "2024-01-15T10:30:00Z"
    },
    "threadContext": "Thread History (3 messages):\nFrom: Customer (customer@example.com)\nSubject: Issue\nDate: 2024-01-14T09:00:00Z\nBody: First message...\n---\nFrom: Support (support@company.com)\nSubject: Re: Issue\nDate: 2024-01-14T10:00:00Z\nBody: Response...\n---",
    "analysisTypes": ["escalation", "churn"]
  }'
```

## With Custom Model Config

Override model configurations:

```json
{
  "config": {
    "modelConfigs": {
      "sentiment": {
        "primary": "gpt-4o",
        "fallback": "gpt-4o-mini"
      },
      "escalation": {
        "primary": "claude-sonnet-4",
        "fallback": "gpt-4o"
      }
    }
  }
}
```

## Response

```json
{
  "success": true,
  "data": {
    "results": {
      "sentiment": {
        "value": "positive",
        "confidence": 0.9
      },
      "kudos": {
        "detected": true,
        "confidence": 0.85,
        "message": "Very happy with service",
        "category": "service"
      }
    }
  }
}
```
