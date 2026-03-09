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
| `deploy-ephemeral.yml` | PRs targeting `main` (excl. Dependabot) | Deploys/tears down ephemeral preview environments |

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

## Ephemeral Environments (Feature Branch Previews)

When a pull request is opened against `main`, the `deploy-ephemeral.yml` workflow automatically provisions a temporary preview environment. This lets team members test and validate changes before merging.

> **Note:** PRs opened by Dependabot (`dependabot[bot]`) do **not** trigger ephemeral deployments.

### How It Works

1. **PR opened/updated** — The workflow builds a Docker image tagged `pr-<number>`, deploys a new Container App using `infra/ephemeral.bicep`, and posts the preview URL as a PR comment.
2. **PR closed/merged** — A teardown job deletes the ephemeral Container App and comments that the environment has been destroyed.

### Preview URL

Each ephemeral environment gets a unique Azure Container Apps FQDN:

```
https://test-chat-pr-<number>-api.<environment-hash>.<region>.azurecontainerapps.io
```

The URL is posted as a comment on the PR after deployment completes.

### Architecture

Ephemeral environments share the **existing** Container Apps Environment from production (`test-chat-env`) but run as a separate Container App with an isolated ingress. This minimises cost (no duplicate Log Analytics or environment resources) and keeps provisioning fast.

| Resource | Shared with prod? | Details |
|----------|--------------------|---------|
| Container Apps Environment | ✅ Yes | Reuses `test-chat-env` |
| Container App | ❌ No | New `test-chat-pr-<N>-api` per PR |
| Storage Account | ❌ No | Uses in-memory storage (no persistent data) |
| Static Web App | ❌ No | Not deployed — the Container App serves both API and static files |

### Cost

Ephemeral Container Apps use the same consumption plan as production:

- **Scale to zero** when idle — $0 while no one is testing.
- **Max 1 replica** — capped to minimise cost.
- Environments are **automatically destroyed** when the PR closes.

### Workflow File

`deploy-ephemeral.yml` — triggers on `pull_request` events targeting `main`:

| Event | Job | Action |
|-------|-----|--------|
| `opened`, `synchronize`, `reopened` | `deploy` | Build image, deploy infra, comment URL |
| `closed` | `teardown` | Delete Container App, comment teardown |

### Required Secrets

The workflow uses the same Azure OIDC secrets as the production deployment:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Bicep Template

`infra/ephemeral.bicep` accepts two key parameters:

| Parameter | Description |
|-----------|-------------|
| `prNumber` | PR number — used to name the Container App (`test-chat-pr-<N>-api`) |
| `containerImage` | Docker image to deploy (e.g. `ghcr.io/kennethheine/test-chat:pr-42`) |

### Manual Teardown

If automatic cleanup fails, you can manually delete an ephemeral environment:

```bash
az containerapp delete \
  --name test-chat-pr-<NUMBER>-api \
  --resource-group rg-test-chat \
  --yes
```

## Related Documentation

- [Architecture](architecture.md) — System overview and infrastructure diagram
- [Regression Testing](regression-testing.md) — CI/CD test workflows
