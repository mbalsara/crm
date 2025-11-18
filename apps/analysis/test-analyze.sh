#!/bin/bash

# Test script for the analysis endpoint
# Usage: ./test-analyze.sh [tenant-id]

TENANT_ID=${1:-"123e4567-e89b-12d3-a456-426614174000"}
BASE_URL=${BASE_URL:-"http://localhost:4002"}

echo "Testing Analysis API..."
echo "Tenant ID: $TENANT_ID"
echo "Base URL: $BASE_URL"
echo ""

# Example 1: Sentiment and Kudos analysis
echo "=== Example 1: Sentiment + Kudos Analysis ==="
curl -X POST "$BASE_URL/api/analysis/analyze" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenantId\": \"$TENANT_ID\",
    \"email\": {
      \"provider\": \"gmail\",
      \"messageId\": \"test-msg-$(date +%s)\",
      \"threadId\": \"test-thread-$(date +%s)\",
      \"subject\": \"Great Service!\",
      \"body\": \"I am very happy with your service! The product exceeded my expectations. Thank you so much!\",
      \"from\": {
        \"email\": \"customer@example.com\",
        \"name\": \"John Doe\"
      },
      \"tos\": [
        {
          \"email\": \"support@company.com\",
          \"name\": \"Support Team\"
        }
      ],
      \"ccs\": [],
      \"bccs\": [],
      \"receivedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"priority\": \"normal\"
    },
    \"analysisTypes\": [\"sentiment\", \"kudos\"],
    \"config\": {
      \"modelConfigs\": {
        \"sentiment\": {
          \"primary\": \"gemini-2.5-pro\",
          \"fallback\": \"gpt-4o-mini\"
        },
        \"kudos\": {
          \"primary\": \"gemini-2.5-pro\",
          \"fallback\": \"gpt-4o-mini\"
        }
      }
    }
  }" | jq '.'

echo ""
echo ""

# Example 2: Escalation detection (requires thread context)
echo "=== Example 2: Escalation Detection (with thread context) ==="
curl -X POST "$BASE_URL/api/analysis/analyze" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenantId\": \"$TENANT_ID\",
    \"email\": {
      \"provider\": \"gmail\",
      \"messageId\": \"test-msg-escalation-$(date +%s)\",
      \"threadId\": \"test-thread-escalation-$(date +%s)\",
      \"subject\": \"URGENT: Need Manager Now\",
      \"body\": \"I am extremely frustrated! This is the third time I am contacting you. I need to speak to a manager immediately. This is unacceptable!\",
      \"from\": {
        \"email\": \"angry@customer.com\",
        \"name\": \"Angry Customer\"
      },
      \"tos\": [
        {
          \"email\": \"support@company.com\"
        }
      ],
      \"ccs\": [],
      \"bccs\": [],
      \"receivedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"priority\": \"high\"
    },
    \"threadId\": \"test-thread-uuid-$(date +%s)\",
    \"analysisTypes\": [\"escalation\", \"sentiment\"]
  }" | jq '.'

echo ""
echo ""

# Example 3: Multiple analyses
echo "=== Example 3: Multiple Analyses (Sentiment + Upsell + Competitor) ==="
curl -X POST "$BASE_URL/api/analysis/analyze" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenantId\": \"$TENANT_ID\",
    \"email\": {
      \"provider\": \"gmail\",
      \"messageId\": \"test-msg-multi-$(date +%s)\",
      \"threadId\": \"test-thread-multi-$(date +%s)\",
      \"subject\": \"Interested in Premium Features\",
      \"body\": \"I am currently on the basic plan and would like to learn more about your premium features. I also noticed that CompetitorXYZ offers similar features. Can you tell me what makes your premium plan better?\",
      \"from\": {
        \"email\": \"prospect@example.com\",
        \"name\": \"Prospect User\"
      },
      \"tos\": [
        {
          \"email\": \"sales@company.com\"
        }
      ],
      \"ccs\": [],
      \"bccs\": [],
      \"receivedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
      \"priority\": \"normal\"
    },
    \"analysisTypes\": [\"sentiment\", \"upsell\", \"competitor\"],
    \"config\": {
      \"modelConfigs\": {
        \"sentiment\": {
          \"primary\": \"gemini-2.5-pro\"
        },
        \"upsell\": {
          \"primary\": \"gemini-2.5-pro\"
        },
        \"competitor\": {
          \"primary\": \"gemini-2.5-pro\"
        }
      }
    }
  }" | jq '.'

echo ""
echo ""
echo "Done!"
