targetScope = 'resourceGroup'

@description('Azure region for all resources — defaults to the resource group location (norwayeast, set by Azure-infrastructure)')
param location string = resourceGroup().location

@description('Base name used to derive resource names')
param appName string = 'test-chat'

@description('Container image to deploy (e.g. ghcr.io/kennethheine/test-chat:latest)')
param containerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Region for Static Web App (limited availability — norwayeast not supported)')
param swaLocation string = 'westeurope'

@description('Custom domain for the Static Web App')
param customDomain string = 'test-chat.kscloud.io'

// ---------- Log Analytics (required by Container Apps Environment) ----------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${appName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ---------- Storage Account (persistent session data) ----------

// Storage account name must be 3-24 chars, lowercase + numbers only
var storageAccountName = replace('${appName}stor', '-', '')

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// Enable Table service (implicit with StorageV2, but declare for clarity)
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// Enable Blob service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
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
  identity: {
    type: 'SystemAssigned'
  }
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
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storageAccount.name }
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

// ---------- RBAC: Container App → Storage Account ----------

// Storage Blob Data Contributor
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource blobRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerApp.id, storageAccount.id, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: containerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalType: 'ServicePrincipal'
  }
}

// Storage Table Data Contributor
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

resource tableRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerApp.id, storageAccount.id, storageTableDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: containerApp.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
    principalType: 'ServicePrincipal'
  }
}

// ---------- Static Web App (frontend) ----------

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${appName}-web'
  location: swaLocation
  sku: {
    name: 'Standard'
    tier: 'Standard'
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

// ---------- Custom Domain ----------

resource customDomainResource 'Microsoft.Web/staticSites/customDomains@2023-12-01' = {
  parent: staticWebApp
  name: customDomain
}

// ---------- Outputs ----------

output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output customDomainUrl string = 'https://${customDomain}'
output containerAppUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
output staticWebAppName string = staticWebApp.name
output containerAppName string = containerApp.name
output storageAccountName string = storageAccount.name
