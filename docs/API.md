# AdMetrics API Documentation

## Overview

The AdMetrics API provides programmatic access to advertising campaign data, metrics, and AI-powered insights. This RESTful API uses JSON for request and response bodies.

## Base URL
https://api.admetrics.ai/v1

For development:
http://localhost:3000/api

## Authentication

All API requests require authentication using JWT tokens.

### Obtaining a Token

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}

Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "role": "USER"
    }
  }
}

Using the Token
Include the token in the Authorization header:
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

Endpoints
Authentication
Register
POST /auth/register

Login
POST /auth/login

Refresh Token
POST /auth/refresh

Logout
POST /auth/logout

Campaigns
List Campaigns
GET /campaigns?page=1&limit=20&platform=GOOGLE_ADS&status=ACTIVE

Parameters:

page (optional): Page number (default: 1)
limit (optional): Items per page (default: 20)
platform (optional): Filter by platform
status (optional): Filter by status
search (optional): Search by name

Get Campaign
GET /campaigns/:id

Create Campaign
POST /campaigns
Content-Type: application/json
{
  "integrationId": "intg_123",
  "name": "Summer Sale 2024",
  "budget": 1000,
  "budgetType": "DAILY",
  "targeting": {
    "age": [25, 45],
    "interests": ["shopping", "fashion"]
  }
}

Update Campaign
PATCH /campaigns/:id
Content-Type: application/json

{
  "name": "Updated Campaign Name",
  "budget": 1500
}

Delete Campaign
DELETE /campaigns/:id

Metrics
Dashboard Metrics
GET /metrics/dashboard?period=7d

Campaign Metrics
GET /metrics/campaigns?campaignIds=camp_1,camp_2&startDate=2024-01-01&endDate=2024-01-31

Parameters:

campaignIds: Comma-separated campaign IDs
startDate: Start date (ISO 8601)
endDate: End date (ISO 8601)
granularity (optional): HOURLY, DAILY, WEEKLY, MONTHLY
metrics (optional): Comma-separated metric names

Platform Metrics
GET /metrics/platforms?startDate=2024-01-01&endDate=2024-01-31

Export Metrics
POST /metrics/export
Content-Type: application/json

{
  "campaignIds": ["camp_1", "camp_2"],
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "format": "excel",
  "metrics": ["spend", "clicks", "conversions"],
  "includeCharts": true
}

AI Insights
Predict Performance
POST /ai/predict/campaign
Content-Type: application/json

{
  "campaignId": "camp_123",
  "horizon": 30,
  "metrics": ["conversions", "spend"]
}

Optimize Budget
POST /ai/optimize/budget
Content-Type: application/json

{
  "campaigns": ["camp_1", "camp_2", "camp_3"],
  "totalBudget": 10000,
  "objective": "conversions",
  "constraints": {
    "minCampaignBudget": 100,
    "maxCampaignBudget": 5000
  }
}

Detect Anomalies
GET /ai/anomalies/detect?campaignId=camp_123&lookback=30

Segment Audience
POST /ai/segment/audience
Content-Type: application/json

{
  "campaignId": "camp_123",
  "method": "kmeans",
  "features": ["age", "interests", "behavior"]
}

Integrations
List Integrations
GET /integrations

Create Integration
POST /integrations
Content-Type: application/json

{
  "platform": "GOOGLE_ADS",
  "name": "My Google Ads Account",
  "credentials": {
    "clientId": "...",
    "clientSecret": "...",
    "refreshToken": "..."
  }
}

Test Integration
POST /integrations/:id/test

Sync Integration
POST /integrations/:id/sync

Reports
Generate Report
POST /reports/generate
Content-Type: application/json

{
  "name": "Monthly Performance Report",
  "type": "performance",
  "campaignIds": ["camp_1", "camp_2"],
  "dateRange": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "metrics": ["spend", "conversions", "roas"],
  "format": "pdf"
}

Download Report
GET /reports/download/:id

Get Report Templates
GET /reports/templates

Error Responses
All errors follow a consistent format:
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {}
  }
}

Common HTTP status codes:

400 - Bad Request
401 - Unauthorized
403 - Forbidden
404 - Not Found
429 - Too Many Requests
500 - Internal Server Error

Rate Limiting
API requests are rate limited:

Standard endpoints: 100 requests per 15 minutes
AI endpoints: 50 requests per hour
Export endpoints: 10 requests per hour

Rate limit information is included in response headers:
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200

WebSocket Events
Connect to real-time updates:
const socket = io('wss://api.admetrics.ai', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to campaign updates
socket.emit('subscribe:campaign', 'camp_123');

// Listen for metrics updates
socket.on('metrics:update', (data) => {
  console.log('Metrics updated:', data);
});

Available events:

metrics:update - Real-time metric updates
alert:new - New alerts
campaign:updated - Campaign status changes
campaign:created - New campaign created
campaign:deleted - Campaign deleted

Code Examples
Node.js
const axios = require('axios');

const api = axios.create({
  baseURL: 'https://api.admetrics.ai/v1',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

// Get campaigns
const campaigns = await api.get('/campaigns');

// Create campaign
const newCampaign = await api.post('/campaigns', {
  integrationId: 'intg_123',
  name: 'New Campaign',
  budget: 1000
});

Python
import requests

headers = {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
}

# Get metrics
response = requests.get(
    'https://api.admetrics.ai/v1/metrics/dashboard',
    headers=headers,
    params={'period': '7d'}
)

data = response.json()

cURL
# Get campaign
curl -X GET https://api.admetrics.ai/v1/campaigns/camp_123 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update campaign
curl -X PATCH https://api.admetrics.ai/v1/campaigns/camp_123 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"budget": 2000}'

SDKs
Official SDKs are available for:

JavaScript/TypeScript: npm install @admetrics/sdk
Python: pip install admetrics-sdk
PHP: composer require admetrics/sdk

Support
For API support:

Documentation: https://docs.admetrics.ai
Email: api-support@admetrics.ai
Status: https://status.admetrics.ai