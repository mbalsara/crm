#!/bin/bash

# Test creating a company with multiple domains
# Replace TENANT_ID with a valid UUID from your database

TENANT_ID="123e4567-e89b-12d3-a456-426614174000"
API_URL="http://localhost:4000"

echo "Creating company with multiple domains..."
curl -X POST "${API_URL}/api/companies" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'"${TENANT_ID}"'",
    "domains": [
      "example.com",
      "example.org",
      "example.net"
    ],
    "name": "Example Corporation",
    "website": "https://example.com",
    "industry": "Technology",
    "metadata": {
      "founded": "2020",
      "employees": 100
    }
  }' | jq '.'

echo -e "\n\nTesting lookup by first domain..."
curl -X GET "${API_URL}/api/companies/domain/${TENANT_ID}/example.com" | jq '.'

echo -e "\n\nTesting lookup by second domain..."
curl -X GET "${API_URL}/api/companies/domain/${TENANT_ID}/example.org" | jq '.'

echo -e "\n\nTesting lookup by third domain..."
curl -X GET "${API_URL}/api/companies/domain/${TENANT_ID}/example.net" | jq '.'

echo -e "\n\nListing all companies for tenant..."
curl -X GET "${API_URL}/api/companies/tenant/${TENANT_ID}" | jq '.'
