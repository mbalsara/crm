# Simple Curl Example

## Basic Request

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

**Simply pass `analysisTypes` array:**

```json
{
  "analysisTypes": ["sentiment", "escalation", "upsell", "churn", "kudos", "competitor"]
}
```

Available types:
- `sentiment` - Emotional tone
- `escalation` - Escalation detection (needs threadContext)
- `upsell` - Upsell opportunities
- `churn` - Churn risk (needs threadContext)
- `kudos` - Positive feedback
- `competitor` - Competitor mentions
- `signature-extraction` - Extract signature

## With Thread Context

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
      "from": {"email": "customer@example.com"},
      "tos": [{"email": "support@company.com"}],
      "ccs": [],
      "bccs": [],
      "receivedAt": "2024-01-15T10:30:00Z"
    },
    "threadContext": "Thread History (3 messages):\nFrom: Customer\nSubject: Issue\nDate: 2024-01-14T09:00:00Z\nBody: First message...\n---",
    "analysisTypes": ["escalation", "churn"]
  }'
```

## With Custom Model Config

```json
{
  "analysisTypes": ["sentiment"],
  "config": {
    "modelConfigs": {
      "sentiment": {
        "primary": "gpt-4o",
        "fallback": "gpt-4o-mini"
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
        "confidence": 0.85
      }
    }
  }
}
```
