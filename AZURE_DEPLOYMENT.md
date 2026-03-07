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
│   └─ staticwebapp...    │         └──────────────────────────────┘
└─────────────────────────┘
```

**How it works:** Static Web Apps serves the frontend. Requests to `/api/*` are proxied to the Container App backend via a [linked backend](https://learn.microsoft.com/azure/static-web-apps/apis-container-apps). Users never talk directly to the Container App.

## Estimated Monthly Cost

| Resource | Tier | Estimated Cost |
|----------|------|----------------|
| Static Web Apps | Free | **$0** |
| Container Apps Environment | Consumption | **$0** when idle |
| Container Apps vCPU | 0.25 vCPU × active seconds | ~$0.000012/s |
| Container Apps Memory | 0.5 Gi × active seconds | ~$0.000002/s |
| Log Analytics | Free up to 5 GB/month | **$0** (typical) |

**With scale-to-zero**, you pay nothing when no one is using the app. Light usage (a few hours/day) costs **under $1/month**. See [Container Apps pricing](https://azure.microsoft.com/pricing/details/container-apps/) for details.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) v2.60+
- An Azure subscription
- Docker (for building the container image)

## Quick Deploy (Azure CLI)

### 1. Log in and set variables

```bash
az login

RESOURCE_GROUP="test-chat-rg"
LOCATION="eastus"            # choose a region close to your users
APP_NAME="test-chat"
```

### 2. Create the resource group

```bash
az group create --name $RESOURCE_GROUP --location $LOCATION
```

### 3. Deploy with Bicep

Build and push your container image first (see [Build the Docker Image](#build-the-docker-image) below), then deploy:

```bash
az deployment group create \
  --resource-group $RESOURCE_GROUP \
  --template-file infra/main.bicep \
  --parameters \
      appName=$APP_NAME \
      containerImage="<your-registry>/test-chat:latest"
```

The deployment outputs the URLs for both the Static Web App and the Container App.

### 4. Deploy the frontend

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

# Tag for your registry (Azure Container Registry or GitHub Container Registry)
docker tag test-chat:latest <your-registry>/test-chat:latest

# Push
docker push <your-registry>/test-chat:latest
```

### Option A: Azure Container Registry

```bash
# Create an ACR (adds ~$5/month for Basic tier)
az acr create --name ${APP_NAME}acr --resource-group $RESOURCE_GROUP --sku Basic
az acr login --name ${APP_NAME}acr

# Build and push in one step
az acr build --registry ${APP_NAME}acr --image test-chat:latest .
```

### Option B: GitHub Container Registry (free for public repos)

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker tag test-chat:latest ghcr.io/USERNAME/test-chat:latest
docker push ghcr.io/USERNAME/test-chat:latest
```

## Update the Container App

After pushing a new image, update the running app:

```bash
az containerapp update \
  --name "${APP_NAME}-api" \
  --resource-group $RESOURCE_GROUP \
  --image <your-registry>/test-chat:latest
```

## Environment Variables

The Container App needs no mandatory environment variables — users provide their GitHub token through the web UI. However, you can set optional variables:

```bash
az containerapp update \
  --name "${APP_NAME}-api" \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "COPILOT_GITHUB_TOKEN=<token>"
```

## Local Testing with Docker

```bash
docker build -t test-chat:latest .
docker run -p 3000:3000 test-chat:latest
# Open http://localhost:3000
```

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Container Apps (chosen)** | Scale to zero, consumption pricing, no changes to Express code | Cold starts (~2-5 s) |
| App Service (Free/B1) | Always-on, no cold starts | Free tier limits (60 min CPU/day); B1 ~$13/month |
| Azure Functions | True serverless | Requires refactoring Express to function handlers |
| Container Instances | Simple | No scale-to-zero, billed while running (~$30/month) |
