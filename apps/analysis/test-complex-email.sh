#!/bin/bash

# Test complex email with all analysis types
# This email is designed to trigger multiple analyses:
# - Sentiment: Mixed (frustrated but also positive)
# - Escalation: Mentions "escalate" and "manager"
# - Upsell: Mentions "upgrade" and "premium features"
# - Churn: Mentions "canceling" and "competitor"
# - Kudos: Positive feedback about support team
# - Competitor: Mentions "Salesforce" and "HubSpot"
# - Signature: Contains signature block
# - Domain extraction: Multiple email domains
# - Contact extraction: Phone numbers and emails

curl -X POST http://localhost:4002/api/analysis/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "123e4567-e89b-12d3-a456-426614174000",
    "email": {
      "provider": "gmail",
      "messageId": "complex-email-001",
      "threadId": "thread-complex-001",
      "subject": "Need to discuss account changes - considering upgrade but also evaluating alternatives",
      "body": "Hi Support Team,\n\nI wanted to reach out about my account. I've been using your service for about 6 months now, and overall I'm quite happy with the support team - Sarah and Mike have been incredibly helpful whenever I've had questions.\n\nHowever, I'm facing some challenges with the current plan limitations. I'm hitting the storage limits frequently and need more advanced reporting features. I saw that you have a premium tier that includes these features, and I'm interested in learning more about upgrading.\n\nThat said, I've also been evaluating other options. I've looked at Salesforce's offerings and HubSpot's platform, and they seem to have some features that might better fit my needs. I'm not sure if I should upgrade with you or switch to one of these competitors.\n\nI'm getting pressure from my management team to make a decision soon, and I may need to escalate this to your manager if we can't find a solution quickly. I really don't want to cancel my subscription, but I need to make sure I'm making the right choice for my business.\n\nCould we schedule a call this week to discuss my options? I'm available Monday through Wednesday.\n\nThanks for your help!\n\nBest regards,\n\nJohn Smith\nVP of Operations\nAcme Corporation\nEmail: john.smith@acme-corp.com\nPhone: +1 (555) 123-4567\nMobile: +1 (555) 987-6543\nWebsite: www.acme-corp.com\n\n---\nThis email was sent from my iPhone. Please excuse any typos.",
      "from": {
        "email": "john.smith@acme-corp.com",
        "name": "John Smith"
      },
      "tos": [
        {
          "email": "support@company.com",
          "name": "Support Team"
        }
      ],
      "ccs": [
        {
          "email": "manager@acme-corp.com",
          "name": "Jane Manager"
        }
      ],
      "bccs": [],
      "receivedAt": "2024-01-15T14:30:00Z"
    },
    "analysisTypes": [
      "sentiment",
      "escalation",
      "upsell",
      "churn",
      "kudos",
      "competitor",
      "signature-extraction",
      "domain-extraction",
      "contact-extraction"
    ]
  }' | jq '.'
