#!/bin/bash

##############################################################################
# Gmail Integration Setup Script for GCP
#
# This script sets up the required GCP resources for Gmail webhook integration
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Gmail service deployed to Cloud Run
#   - Gmail API enabled in the project
#
# Usage:
#   ./scripts/gmail-setup.sh PROJECT_ID GMAIL_SERVICE_URL [REGION]
#
# Example:
#   ./scripts/gmail-setup.sh health-474623 https://crm-gmail-5zi5fwogiq-uc.a.run.app us-central1
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ "$#" -lt 2 ]; then
    echo -e "${RED}Error: Missing required arguments${NC}"
    echo "Usage: $0 PROJECT_ID GMAIL_SERVICE_URL [REGION]"
    echo ""
    echo "Arguments:"
    echo "  PROJECT_ID         - Your GCP project ID"
    echo "  GMAIL_SERVICE_URL  - The URL of your deployed Gmail Cloud Run service"
    echo "  REGION            - (Optional) GCP region, defaults to us-central1"
    echo ""
    echo "Example:"
    echo "  $0 health-474623 https://crm-gmail-5zi5fwogiq-uc.a.run.app us-central1"
    exit 1
fi

PROJECT_ID=$1
GMAIL_SERVICE_URL=$2
REGION=${3:-us-central1}

echo -e "${GREEN}=== Gmail Integration Setup ===${NC}"
echo "Project ID: $PROJECT_ID"
echo "Gmail Service URL: $GMAIL_SERVICE_URL"
echo "Region: $REGION"
echo ""

# Verify Gmail service URL is valid
if [[ ! "$GMAIL_SERVICE_URL" =~ ^https:// ]]; then
    echo -e "${RED}Error: Gmail service URL must start with https://${NC}"
    exit 1
fi

# Step 1: Enable Required APIs
echo -e "${YELLOW}Step 1: Enabling required APIs...${NC}"
gcloud services enable pubsub.googleapis.com --project=$PROJECT_ID
gcloud services enable gmail.googleapis.com --project=$PROJECT_ID
echo -e "${GREEN}✓ APIs enabled${NC}"
echo ""

# Step 2: Create Pub/Sub Topic
echo -e "${YELLOW}Step 2: Creating Pub/Sub topic for Gmail notifications...${NC}"
if gcloud pubsub topics describe gmail-notifications --project=$PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}  Topic 'gmail-notifications' already exists, skipping...${NC}"
else
    gcloud pubsub topics create gmail-notifications --project=$PROJECT_ID
    echo -e "${GREEN}✓ Topic created: gmail-notifications${NC}"
fi
echo ""

# Step 3: Grant Gmail Permission to Publish
echo -e "${YELLOW}Step 3: Granting Gmail API permission to publish to topic...${NC}"
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=$PROJECT_ID \
  --quiet
echo -e "${GREEN}✓ IAM policy binding added${NC}"
echo ""

# Step 4: Create Push Subscription
echo -e "${YELLOW}Step 4: Creating Pub/Sub push subscription...${NC}"
WEBHOOK_ENDPOINT="$GMAIL_SERVICE_URL/webhooks/pubsub"

if gcloud pubsub subscriptions describe gmail-push-subscription --project=$PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}  Subscription 'gmail-push-subscription' already exists${NC}"
    echo -e "${YELLOW}  Updating push endpoint to: $WEBHOOK_ENDPOINT${NC}"
    gcloud pubsub subscriptions update gmail-push-subscription \
      --push-endpoint=$WEBHOOK_ENDPOINT \
      --project=$PROJECT_ID
    echo -e "${GREEN}✓ Subscription updated${NC}"
else
    gcloud pubsub subscriptions create gmail-push-subscription \
      --topic=gmail-notifications \
      --push-endpoint=$WEBHOOK_ENDPOINT \
      --project=$PROJECT_ID
    echo -e "${GREEN}✓ Subscription created: gmail-push-subscription${NC}"
fi
echo ""

# Step 5: Verify Setup
echo -e "${YELLOW}Step 5: Verifying setup...${NC}"

# Check topic exists
if gcloud pubsub topics describe gmail-notifications --project=$PROJECT_ID &>/dev/null; then
    echo -e "${GREEN}✓ Topic exists: gmail-notifications${NC}"
else
    echo -e "${RED}✗ Topic not found${NC}"
fi

# Check subscription exists
if gcloud pubsub subscriptions describe gmail-push-subscription --project=$PROJECT_ID &>/dev/null; then
    echo -e "${GREEN}✓ Subscription exists: gmail-push-subscription${NC}"

    # Show subscription details
    PUSH_ENDPOINT=$(gcloud pubsub subscriptions describe gmail-push-subscription --project=$PROJECT_ID --format="value(pushConfig.pushEndpoint)")
    echo "  Push endpoint: $PUSH_ENDPOINT"
else
    echo -e "${RED}✗ Subscription not found${NC}"
fi

echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Insert Gmail integration record into database:"
echo "   psql \$DATABASE_URL -f scripts/insert-gmail-integration.sql"
echo ""
echo "2. For each tenant, call gmail.users.watch() with:"
echo "   topicName: projects/$PROJECT_ID/topics/gmail-notifications"
echo ""
echo "3. Send a test email to the monitored Gmail account"
echo ""
echo "4. Check logs:"
echo "   gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=crm-gmail' --limit=50 --project=$PROJECT_ID"
echo ""
