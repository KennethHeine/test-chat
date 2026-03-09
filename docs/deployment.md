# Deployment Guide

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

**How it works:** Static Web Apps serves the frontend. Requests to `/api/*` are proxied to the Container App backend via a [linked backend](https://learn.microsoft.com/azure/static-web-apps/apis-container-apps). The Container App authenticates to Azure Storage via **managed identity** (system-assigned identity with Storage Blob Data Contributor and Storage Table Data Contributor RBAC roles).

## Estimated Monthly Cost

| Resource | Tier | Estimated Cost |
|----------|------|----------------|
| Static Web Apps | Free | **$0** |
| Container Apps Environment | Consumption | **$0** when idle |
| Container Apps vCPU | 0.25 vCPU × active seconds | ~$0.000012/s |
| Container Apps Memory | 0.5 Gi × active seconds | ~$0.000002/s |
| Storage Account (Table + Blob) | Standard LRS | **$0** (typical light usage) |
| Log Analytics | Free up to 5 GB/month | **$0** (typical) |

**With scale-to-zero**, you pay nothing when no one is using the app. Light usage (a few hours/day) costs **under $1/month**.

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) v2.60+
- An Azure subscription
- Docker (for building the container image)
- Resource group `rg-test-chat` (managed by [Azure-infrastructure](https://github.com/KennethHeine/Azure-infrastructure))

## CI/CD Deployment (Recommended)

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

## Update the Container App

After pushing a new image:

```bash
az containerapp update \
  --name test-chat-api \
  --resource-group rg-test-chat \
  --image ghcr.io/KennethHeine/test-chat:latest
```

## Environment Variables

The Container App needs no mandatory environment variables. Optional:

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

---

## Scaling Configuration

All scaling configuration lives in **`infra/main.bicep`**. Changes deploy automatically via the `deploy-infra.yml` workflow when pushed to `main`.

### Current Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `minReplicas` | `0` | Scales to zero when idle — no cost when unused |
| `maxReplicas` | `3` | Caps maximum instances to control cost |
| `concurrentRequests` | `20` | Adds a replica per 20 concurrent requests |
| `cpu` | `0.25 vCPU` | Minimum allocation per replica |
| `memory` | `0.5 Gi` | Minimum allocation per replica |

### How Scaling Works

```
Idle (0 requests)    → 0 replicas  → $0.00/month
Light usage          → 1 replica   → billed per active second
20+ concurrent reqs  → 2 replicas  → auto-scaled
60+ concurrent reqs  → 3 replicas  → max (capped)
Traffic drops        → scales back → eventually 0
```

Cold start time when scaling from 0 → 1 is approximately **2–5 seconds**.

### Disable Scale-to-Zero (Always-On)

```bicep
scale: {
  minReplicas: 1  // Always keep one replica running
  maxReplicas: 3
}
```

> **Cost impact**: ~$7–10/month for one always-on 0.25 vCPU replica.

### Increase Maximum Replicas

```bicep
scale: {
  minReplicas: 0
  maxReplicas: 10  // Allow more replicas under load
}
```

### Adjust Scaling Sensitivity

```bicep
rules: [
  {
    name: 'http-scaling'
    http: {
      metadata: {
        concurrentRequests: '10'  // Scale at 10 instead of 20
      }
    }
  }
]
```

### Emergency: Manual Scale Override

```bash
# Scale to zero (stop all replicas)
az containerapp update \
  --name test-chat-api \
  --resource-group rg-test-chat \
  --min-replicas 0 --max-replicas 0

# Restore normal auto-scaling
az containerapp update \
  --name test-chat-api \
  --resource-group rg-test-chat \
  --min-replicas 0 --max-replicas 3
```

> Manual overrides will be reverted on the next `deploy-infra` workflow run.

### Access Control

Scaling changes are restricted to the repository owner:

1. **Infrastructure as Code** — All scale settings live in `infra/main.bicep`, deployed via GitHub Actions
2. **Azure RBAC** — The `rg-test-chat` resource group scopes the service principal's permissions
3. **Branch protection** — Require PR reviews on `main` to prevent unauthorized changes
4. **Manual CLI access** — Only authenticated users with Owner/Contributor role can run emergency commands

## Alternatives Considered

| Option | Pros | Cons |
|--------|------|------|
| **Container Apps (chosen)** | Scale to zero, consumption pricing, no changes to Express code | Cold starts (~2-5 s) |
| App Service (Free/B1) | Always-on, no cold starts | Free tier limits (60 min CPU/day); B1 ~$13/month |
| Azure Functions | True serverless | Requires refactoring Express to function handlers |
| Container Instances | Simple | No scale-to-zero, billed while running (~$30/month) |

## Related Documentation

- [Architecture](architecture.md) — System overview and infrastructure diagram
- [Regression Testing](regression-testing.md) — CI/CD test workflows
