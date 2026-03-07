targetScope = 'resourceGroup'

@description('Azure region for all resources')
param location string = 'norwayeast'

@description('Base name used to derive resource names')
param appName string = 'test-chat'

@description('Container image to deploy (e.g. ghcr.io/KennethHeine/test-chat:latest)')
param containerImage string

// ---------- Log Analytics (required by Container Apps Environment) ----------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ---------- Container Apps Environment (Consumption plan) ----------

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${appName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------- Container App (backend API) ----------

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${appName}-api'
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
      // Scale to zero when idle to minimize cost
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
          ]
        }
      ]
      scale: {
        minReplicas: 0 // Scale to zero when idle
        maxReplicas: 3
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

// ---------- Static Web App (frontend) ----------

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${appName}-web'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: '/public'
      outputLocation: '/public'
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// ---------- Link Static Web App → Container App backend ----------

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-12-01' = {
  parent: staticWebApp
  name: 'backend'
  properties: {
    backendResourceId: containerApp.id
    region: location
  }
}

// ---------- Outputs ----------

output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output staticWebAppName string = staticWebApp.name
output containerAppName string = containerApp.name
