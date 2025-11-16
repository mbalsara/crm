#!/bin/bash

# Gmail Pub/Sub Setup Script
# This script sets up Gmail API with Pub/Sub for push notifications
# Usage: ./setup-gmail-pubsub.sh <project-id> <cloud-run-url>

set -e

PROJECT_ID=${1:-}
CLOUD_RUN_URL=${2:-}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Project ID is required"
  echo "Usage: ./setup-gmail-pubsub.sh <project-id> <cloud-run-url>"
  exit 1
fi

echo "Setting up Gmail Pub/Sub for project: $PROJECT_ID"

# Enable required APIs
echo "Enabling APIs..."
gcloud services enable gmail.googleapis.com pubsub.googleapis.com --project=$PROJECT_ID

# Create Pub/Sub topic
echo "Creating Pub/Sub topic 'gmail-notifications'..."
if gcloud pubsub topics describe gmail-notifications --project=$PROJECT_ID &>/dev/null; then
  echo "Topic already exists, skipping creation"
else
  gcloud pubsub topics create gmail-notifications --project=$PROJECT_ID
fi

# Grant Gmail permission to publish
echo "Granting Gmail API permission to publish..."
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=$PROJECT_ID

# Create subscription if Cloud Run URL is provided
if [ -n "$CLOUD_RUN_URL" ]; then
  echo "Creating Pub/Sub subscription..."
  WEBHOOK_URL="${CLOUD_RUN_URL}/webhooks/gmail"

  if gcloud pubsub subscriptions describe gmail-notifications-sub --project=$PROJECT_ID &>/dev/null; then
    echo "Subscription already exists, updating..."
    gcloud pubsub subscriptions update gmail-notifications-sub \
      --push-endpoint=$WEBHOOK_URL \
      --project=$PROJECT_ID
  else
    gcloud pubsub subscriptions create gmail-notifications-sub \
      --topic=gmail-notifications \
      --push-endpoint=$WEBHOOK_URL \
      --project=$PROJECT_ID
  fi

  echo "Webhook endpoint: $WEBHOOK_URL"
else
  echo "Skipping subscription creation (no Cloud Run URL provided)"
  echo "Run this command later to create subscription:"
  echo "  gcloud pubsub subscriptions create gmail-notifications-sub \\"
  echo "    --topic=gmail-notifications \\"
  echo "    --push-endpoint=https://YOUR_CLOUD_RUN_URL/webhooks/gmail \\"
  echo "    --project=$PROJECT_ID"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Go to https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
echo "2. Create OAuth 2.0 Client ID (Desktop or Web application)"
echo "3. Download the credentials JSON file"
echo "4. Run: pnpm run oauth:setup (to authenticate and get refresh token)"
echo ""
echo "Pub/Sub topic: projects/$PROJECT_ID/topics/gmail-notifications"
