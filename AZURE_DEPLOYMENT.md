# Azure Deployment Guide

Deploy the chat app on Azure using **Static Web Apps** (frontend) and **Container Apps** (backend). This setup minimizes cost by using free and consumption-based tiers that scale to zero.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  Azure Static Web Apps  │  /api/* │  Azure Container Apps        │
│  (Free tier)            │────────>│  (Consumption plan)          │
│                         │  proxy  │                              │
│  public/                │         │  Express.js API server       │
│   ├─ index.html         │         │  Scale: 0 – 3 replicas       │
│   ├─ app.js             │         │  0.25 vCPU · 0.5 Gi memory   │
│   └─ staticwebapp...    │         └────────────┬─────────────────┘
└─────────────────────────┘                      │
                                                 ▼
                                    ┌──────────────────────────────┐
                                    │  Azure Storage Account       │
                                    │  (Standard LRS)              │
                                    │                              │
                                    │  Table Storage: sessions     │
                                    │  Blob Storage: chatmessages  │
                                    └──────────────────────────────┘
```

**How it works:** Static Web Apps serves the frontend. Requests to `/api/*` are proxied to the Container App backend via a [linked backend](https://learn.microsoft.com/azure/static-web-apps/apis-container-apps). The Container App authenticates to Azure Storage via **managed identity** (system-assigned identity with Storage Blob Data Contributor and Storage Table Data Contributor RBAC roles). Users never talk directly to the Container App or Storage Account.

## Estimated Monthly Cost

| Resource | Tier | Estimated Cost |
|----------|------|----------------|
| Static Web Apps | Free | **$0** |
| Container Apps Environment | Consumption | **$0** when idle |
| Container Apps vCPU | 0.25 vCPU × active seconds | ~$0.000012/s |
| Container Apps Memory | 0.5 Gi × active seconds | ~$0.000002/s |
| Storage Account (Table + Blob) | Standard LRS | **$0** (typical light usage) |
| Log Analytics | Free up to 5 GB/month | **$0** (typical) |

**With scale-to-zero**, you pay nothing when no one is using the app. Light usage (a few hours/day) costs **under $1/month**. See [Container Apps pricing](https://azure.microsoft.com/pricing/details/container-apps/) for details.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) v2.60+
- An Azure subscription
- Docker (for building the container image)
- Resource group `rg-test-chat` (managed by [Azure-infrastructure](https://github.com/KennethHeine/Azure-infrastructure))

## CI/CD Deployment (recommended)

Push to `main` and GitHub Actions handles everything:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `deploy-infra.yml` | `infra/**` changes or manual | Deploys Bicep template to `rg-test-chat` |
| `deploy-app.yml` | `public/**`, `server.ts`, `Dockerfile` changes or manual | Builds Docker image → pushes to GHCR → updates Container App → deploys SWA |

**Required repo secrets** (provisioned by [Azure-infrastructure](https://github.com/KennethHeine/Azure-infrastructure)):
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

## Manual Deploy (Azure CLI)

### 1. Log in and set variables

```bash
az login

RESOURCE_GROUP="rg-test-chat"
APP_NAME="test-chat"
```

### 2. Deploy infrastructure

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters \
      appName=$APP_NAME \
      containerImage=ghcr.io/KennethHeine/test-chat:latest
```

The deployment outputs the URLs for both the Static Web App and the Container App.

### 3. Deploy the frontend

```bash
# Get the deployment token
SWA_TOKEN=$(az staticwebapp secrets list \
  --name "${APP_NAME}-web" \
  --resource-group $RESOURCE_GROUP \
  --query "properties.apiKey" -o tsv)

# Deploy static files using the SWA CLI
npx @azure/static-web-apps-cli deploy ./public \
  --deployment-token $SWA_TOKEN \
  --env production
```

## Build the Docker Image

```bash
# Build locally
docker build -t test-chat:latest .

# Tag and push to GitHub Container Registry
docker tag test-chat:latest ghcr.io/KennethHeine/test-chat:latest
docker push ghcr.io/KennethHeine/test-chat:latest
```

> The `deploy-app.yml` workflow handles this automatically on push to `main`.

## Update the Container App

After pushing a new image, update the running app:

```bash
az containerapp update \
  --name test-chat-api \
  --resource-group rg-test-chat \
  --image ghcr.io/KennethHeine/test-chat:latest
```

## Environment Variables

The Container App needs no mandatory environment variables — users provide their GitHub token through the web UI. However, you can set optional variables:

```bash
az containerapp update \
  --name test-chat-api \
  --resource-group rg-test-chat \
  --set-env-vars "COPILOT_GITHUB_TOKEN=<token>"
```

## Local Testing with Docker

```bash
docker build -t test-chat:latest .
docker run -p 3000:3000 test-chat:latest
# Open http://localhost:3000
```

## Scaling

See [SCALING.md](SCALING.md) for detailed scaling configuration, including how to change min/max replicas, adjust scaling thresholds, and emergency manual overrides.

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Container Apps (chosen)** | Scale to zero, consumption pricing, no changes to Express code | Cold starts (~2-5 s) |
| App Service (Free/B1) | Always-on, no cold starts | Free tier limits (60 min CPU/day); B1 ~$13/month |
| Azure Functions | True serverless | Requires refactoring Express to function handlers |
| Container Instances | Simple | No scale-to-zero, billed while running (~$30/month) |
