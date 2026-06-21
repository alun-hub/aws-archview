// ─── LZA YAML config types ────────────────────────────────────────────────────

export interface AccountConfig {
  name: string
  description?: string
  email: string
  organizationalUnit: string
  warm?: boolean
  tags?: Record<string, string>
}

export interface AccountsConfig {
  mandatoryAccounts: AccountConfig[]
  workloadAccounts?: AccountConfig[]
}

export interface OUConfig {
  name: string
  ignore?: boolean
  tags?: Record<string, string>
  organizationalUnits?: OUConfig[]
}

export interface SCP {
  name: string
  description?: string
  policy?: string
  deploymentTargets?: { organizationalUnits?: string[]; accounts?: string[] }
}

export interface OrganizationConfig {
  enable: boolean
  organizationalUnits?: OUConfig[]
  serviceControlPolicies?: SCP[]
  taggingPolicies?: unknown[]
  backupPolicies?: unknown[]
}

export interface SubnetConfig {
  name: string
  availabilityZone: string
  routeTable: string
  ipv4CidrBlock: string
  tags?: Record<string, string>[]
}

export interface TgwAttachmentConfig {
  name: string
  transitGateway: { name: string; account: string }
  routeTableAssociations?: { routeTableName: string }[]
  routeTablePropagations?: { routeTableName: string }[]
  subnets?: string[]
}

export interface VpcConfig {
  name: string
  account: string
  region: string
  cidrs: string[]
  internetGateway?: boolean
  enableDnsHostnames?: boolean
  enableDnsSupport?: boolean
  subnets?: SubnetConfig[]
  transitGatewayAttachments?: TgwAttachmentConfig[]
  natGateways?: { name: string; subnet: string }[]
  loadBalancers?: {
    applicationLoadBalancers?: { name: string; subnets: string[] }[]
    networkLoadBalancers?: { name: string; subnets: string[] }[]
  }
  tags?: Record<string, string>[]
}

export interface TgwConfig {
  name: string
  account: string
  region: string
  asn?: number
  defaultRouteTableAssociation?: string
  defaultRouteTablePropagation?: string
  autoAcceptSharingAttachments?: string
  shareTargets?: { organizationalUnits?: string[]; accounts?: string[] }
  tags?: Record<string, string>[]
}

export interface TgwRouteTableConfig {
  name: string
  transitGateway: { name: string; account: string }
}

export interface VpnTunnelSpec {
  tunnelInsideCidr: string
}

export interface VpnConnectionConfig {
  name: string
  transitGateway: string
  routeTableAssociations?: { routeTableName: string }[]
  routeTablePropagations?: { routeTableName: string }[]
  staticRoutesOnly?: boolean
  tunnelSpecifications?: VpnTunnelSpec[]
}

export interface CustomerGatewayConfig {
  name: string
  account: string
  region: string
  ipAddress: string
  asn: number
  vpnConnections?: VpnConnectionConfig[]
}

export interface VpcPeeringConfig {
  name: string
  vpcs: string[]
  tags?: Record<string, string>[]
}

export interface PermissionSetConfig {
  name: string
  description?: string
  sessionDuration?: string
  awsManagedPolicies?: string[]
  customerManagedPolicies?: { name: string }[]
}

export interface StatefulRule {
  action: string
  header: {
    destination: string
    destinationPort: string
    direction: string
    protocol: string
    source: string
    sourcePort: string
  }
  ruleOptions?: { keyword: string; settings?: string[] }[]
}

export interface StatelessRule {
  priority: number
  ruleDefinition: {
    actions: string[]
    matchAttributes: {
      sources: { addressDefinition: string }[]
      destinations: { addressDefinition: string }[]
      sourcePorts?: { fromPort: number; toPort: number }[]
      destinationPorts?: { fromPort: number; toPort: number }[]
      protocols?: number[]
    }
  }
}

export interface FirewallRuleGroupConfig {
  name: string
  regions?: string[]
  capacity?: number
  type: string
  ruleGroup?: {
    rulesSource: {
      statefulRules?: StatefulRule[]
      statelessRulesAndCustomActions?: {
        statelessRules: StatelessRule[]
      }
      rulesFile?: string
    }
  }
}

export interface IdentityCenterAssignmentConfig {
  name: string
  permissionSetName: string
  principalType: 'GROUP' | 'USER'
  principalId: string
  deploymentTargets: {
    accounts?: string[]
    organizationalUnits?: string[]
  }
}

export interface NetworkConfig {
  defaultVpc?: { delete: boolean }
  vpcs?: VpcConfig[]
  vpcPeering?: VpcPeeringConfig[]
  transitGateways?: TgwConfig[]
  transitGatewayRouteTables?: TgwRouteTableConfig[]
  customerGateways?: CustomerGatewayConfig[]
  centralNetworkServices?: {
    networkFirewall?: {
      firewalls?: { name: string; vpc: string; subnets: string[] }[]
      rules?: FirewallRuleGroupConfig[]
    }
  }
}

// ── Security config ────────────────────────────────────────────────────────────

export interface SecurityConfig {
  enableDlpChecks?: boolean
  macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
  guardduty?: { enable: boolean; s3Protection?: { enable: boolean } }
  securityHub?: { enable: boolean; standards?: (string | { name: string })[] }
  awsConfig?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
  cloudwatch?: { enable?: boolean }
  cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
}

// ── IAM config ────────────────────────────────────────────────────────────────

export interface IamPermissionSet {
  name: string
  description?: string
  sessionDuration?: string
  policies?: unknown[]
  awsManagedPolicies?: string[]
  customerManagedPolicies?: { name: string }[]
}

export interface IamAssignment {
  name: string
  permissionSetName: string
  principalType: 'GROUP' | 'USER'
  principalId: string
  deploymentTargets: {
    accounts?: string[]
    organizationalUnits?: string[]
  }
}

export interface IamConfig {
  identityCenter?: {
    enable?: boolean
    name?: string
    delegatedAdminAccount?: string
    [key: string]: unknown
  }
  permissionSets?: PermissionSetConfig[]
  identityCenterAssignments?: IdentityCenterAssignmentConfig[]
}

// ── Global config ─────────────────────────────────────────────────────────────

export interface GlobalConfig {
  homeRegion: string
  enabledRegions?: string[]
  managementAccountAccessRole?: string
  cloudwatchLogRetentionInDays?: number
  controlTower?: {
    enable: boolean
    regions?: { name: string }[]
  }
  logging?: {
    account?: string
    cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
    sessionManager?: { sendToCloudWatchLogs?: boolean; sendToS3?: boolean }
    cloudwatchLogs?: { enable: boolean }
  }
  reports?: {
    costAndUsageReport?: unknown
    budgets?: { name: string; amount: number; type: string; unit: string }[]
  }
  backup?: { vaults?: { name: string; deploymentTargets?: unknown }[] }
  snsTopics?: unknown
  tags?: { key: string; value: string }[]
}

// ── Customizations config ─────────────────────────────────────────────────────

export interface CfnDeploymentTargets {
  accounts?: string[]
  organizationalUnits?: string[]
  excludedAccounts?: string[]
  excludedRegions?: string[]
}

export interface CfnStackConfig {
  name: string
  description?: string
  regions?: string[]
  deploymentTargets?: CfnDeploymentTargets
  template?: string
  runOrder?: number
  terminationProtection?: boolean
  parameters?: { name: string; value: string }[]
  tags?: { key: string; value: string }[]
}

export interface CustomizationsConfig {
  cloudFormationStacks?: CfnStackConfig[]
  cloudFormationStackSets?: CfnStackConfig[]
  serviceCatalogPortfolios?: {
    name: string
    description?: string
    provider?: string
    regions?: string[]
    deploymentTargets?: CfnDeploymentTargets
    products?: unknown[]
  }[]
}

// ── Parsed graph model ────────────────────────────────────────────────────────

export type NodeKind =
  | 'root' | 'ou' | 'account' | 'region' | 'on-premises'
  | 'vpc' | 'subnet' | 'subnet-public' | 'subnet-private' | 'subnet-firewall' | 'subnet-tgw'
  | 'tgw' | 'tgw-rt-group' | 'tgw-rt' | 'vpn' | 'cgw' | 'dx'
  | 'nlb' | 'alb' | 'network-firewall' | 'nat-gateway' | 'igw'
  | 'route53' | 'cloudwatch' | 'cloudtrail' | 'config' | 'organizations' | 'control-tower'
  | 'security-hub' | 'guardduty' | 'inspector' | 'macie' | 'iam' | 'acm' | 'kms'
  | 'detective' | 'audit-manager' | 'firewall-manager' | 's3' | 'backup' | 'lambda' | 'service'
  | 'cloud' | 'cloudformation' | 'service-catalog'

export interface GraphNode {
  id: string
  kind: NodeKind
  label: string
  data: Record<string, unknown>
  parentId?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  label?: string
  kind?: 'tgw' | 'tgw-hub' | 'vpn' | 'peering' | 'flow' | 'propagation'
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
