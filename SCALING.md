# Scaling Control

This document explains how the Container App scaling is configured and how to control it. Only the repository owner should modify scaling settings.

## Current Configuration

The Container App is configured with **scale-to-zero** in `infra/main.bicep`:

| Setting | Value | Purpose |
|---------|-------|---------|
| `minReplicas` | `0` | Scales to zero when idle — no cost when unused |
| `maxReplicas` | `3` | Caps maximum instances to control cost |
| `concurrentRequests` | `20` | Adds a replica per 20 concurrent requests |
| `cpu` | `0.25 vCPU` | Minimum allocation per replica |
| `memory` | `0.5 Gi` | Minimum allocation per replica |

## How Scaling Works

```
Idle (0 requests)    → 0 replicas  → $0.00/month
Light usage          → 1 replica   → billed per active second
20+ concurrent reqs  → 2 replicas  → auto-scaled
60+ concurrent reqs  → 3 replicas  → max (capped)
Traffic drops        → scales back → eventually 0
```

Cold start time when scaling from 0 → 1 is approximately **2–5 seconds** (varies by image size, region, and platform conditions).

## Changing Scale Settings

All scaling configuration lives in **`infra/main.bicep`**. Changes deploy automatically via the `deploy-infra.yml` workflow when pushed to `main`.

### Disable scale-to-zero (always-on)

Change `minReplicas` from `0` to `1`:

```bicep
scale: {
  minReplicas: 1  // Always keep one replica running
  maxReplicas: 3
}
```

> **Cost impact**: ~$7–10/month for one always-on 0.25 vCPU replica.

### Increase maximum replicas

```bicep
scale: {
  minReplicas: 0
  maxReplicas: 10  // Allow more replicas under load
}
```

### Adjust scaling sensitivity

Lower the `concurrentRequests` threshold to scale out sooner:

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

### Change container resources

```bicep
resources: {
  cpu: json('0.5')    // Increase to 0.5 vCPU
  memory: '1Gi'       // Increase to 1 Gi
}
```

> Valid combinations: see [Container Apps resource limits](https://learn.microsoft.com/azure/container-apps/containers#configuration).

## Emergency: Manual Scale Override

If you need to immediately change scale without pushing to `main`:

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

> **Note**: Manual overrides will be reverted on the next `deploy-infra` workflow run. To make permanent changes, update `infra/main.bicep`.

## Who Controls Scaling

Scaling changes are restricted to the repository owner:

1. **Infrastructure as Code** — All scale settings live in `infra/main.bicep`, deployed via GitHub Actions. Only users with push access to `main` can change them.
2. **Azure RBAC** — The `rg-test-chat` resource group (managed by [Azure-infrastructure](https://github.com/KennethHeine/Azure-infrastructure)) scopes the service principal's permissions. Only the Owner role on that resource group can modify the Container App directly.
3. **Branch protection** — Require PR reviews on `main` to prevent unauthorized scaling changes via code.
4. **Manual CLI access** — Only users authenticated with `az login` who have the Owner/Contributor role on `rg-test-chat` can run the emergency commands above.

To grant someone access to view (but not change) the app, assign them the **Reader** role on the resource group:

```bash
az role assignment create \
  --assignee <user-principal-id> \
  --role Reader \
  --scope /subscriptions/<sub-id>/resourceGroups/rg-test-chat
```
