targetScope = 'resourceGroup'

@description('Azure region — defaults to the resource group location')
param location string = resourceGroup().location

@description('Base name used to derive resource names (must match production infra)')
param appName string = 'test-chat'

@description('Pull request number — used to create a unique Container App per PR')
param prNumber int

@description('Container image to deploy (e.g. ghcr.io/kennethheine/test-chat:pr-42)')
param containerImage string

// ---------- Reference existing Container Apps Environment ----------

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: '${appName}-env'
}

// ---------- Ephemeral Container App (backend + frontend) ----------
// Serves both the Express API and static frontend files.
// Uses in-memory session storage (no Azure Storage dependency).

resource ephemeralApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-pr-${prNumber}-api'
  location: location
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'api'
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'PORT', value: '3000' }
            { name: 'NODE_ENV', value: 'production' }
            // No AZURE_STORAGE_ACCOUNT_NAME — uses in-memory storage
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

// ---------- Outputs ----------

output ephemeralAppUrl string = 'https://${ephemeralApp.properties.configuration.ingress.fqdn}'
output ephemeralAppName string = ephemeralApp.name
