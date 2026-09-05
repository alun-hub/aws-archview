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
  // Tagging and backup policies use the same {name, description, policy,
  // deploymentTargets} shape as SCPs in LZA's organization-config.yaml.
  taggingPolicies?: SCP[]
  backupPolicies?: SCP[]
}

export interface SubnetConfig {
  name: string
  availabilityZone: string
  routeTable: string
  ipv4CidrBlock: string
  /** RAM sharing: which accounts/OUs this subnet is shared with. A shared
   *  subnet belongs to the VPC owner but is used by the target accounts, so it
   *  shows up in both accounts' profiles. */
  shareTargets?: DeploymentTargets
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
  interfaceEndpoints?: { central?: boolean; endpoints?: { service: string }[]; subnets?: string[] }
  gatewayEndpoints?: { defaultPolicy?: string; endpoints?: { service: string }[] }
  useCentralEndpoints?: boolean
  resolverRules?: string[]
  dnsFirewallRuleGroups?: string[]
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

export interface DxVirtualInterfaceConfig {
  name: string
  connectionId?: string
  customerAsn?: number
  interfaceName?: string
  ownerAccount?: string
  region?: string
  type?: 'private' | 'transit' | string
  vlan?: number
  addressFamily?: string
  amazonAddress?: string
  customerAddress?: string
  jumboFrame?: boolean
  tags?: Record<string, string>[]
}

export interface DxTgwAssociationConfig {
  name: string
  account: string
  region?: string
  routeTableAssociations?: string[]
  allowedPrefixes?: string[]
}

export interface DirectConnectGatewayConfig {
  name: string
  asn: number
  gatewayName?: string
  virtualInterfaces?: DxVirtualInterfaceConfig[]
  transitGatewayAssociations?: DxTgwAssociationConfig[]
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

export interface Route53ResolverEndpointConfig {
  name: string
  type: 'INBOUND' | 'OUTBOUND' | string
  vpc: string
  subnets: string[]
  allowedCidrs?: string[]
  securityGroupNames?: string[]
  rules?: Route53ResolverRuleConfig[]
  tags?: Record<string, string>[]
}

export interface Route53ResolverRuleConfig {
  name: string
  domainName?: string
  ruleType?: 'FORWARD' | 'SYSTEM' | 'RECURSIVE' | string
  targetIps?: { ip?: string; ipv4?: string; port?: number | string }[]
  resolverEndpoint?: string
  inboundEndpointTarget?: string
  outboundEndpointTarget?: string
  shareTargets?: {
    accounts?: string[]
    organizationalUnits?: string[]
  }
  tags?: Record<string, string>[]
}

export interface DnsFirewallRuleConfig {
  name: string
  action: 'ALLOW' | 'BLOCK' | 'ALERT' | string
  priority: number
  firewallDomainList?: string
  customDomainList?: string
  blockResponse?: 'NODATA' | 'NXDOMAIN' | 'OVERRIDE' | string
  blockOverrideDomain?: string
  blockOverrideDnsType?: 'CNAME' | string
  blockOverrideTtl?: number
}

export interface DnsFirewallRuleGroupConfig {
  name: string
  regions?: string[]
  rules?: DnsFirewallRuleConfig[]
  shareTargets?: {
    accounts?: string[]
    organizationalUnits?: string[]
  }
  tags?: Record<string, string>[]
}

export interface NetworkConfig {
  defaultVpc?: { delete: boolean }
  vpcs?: VpcConfig[]
  vpcPeering?: VpcPeeringConfig[]
  transitGateways?: TgwConfig[]
  transitGatewayRouteTables?: TgwRouteTableConfig[]
  customerGateways?: CustomerGatewayConfig[]
  directConnectGateways?: DirectConnectGatewayConfig[]
  centralNetworkServices?: {
    networkFirewall?: {
      firewalls?: { name: string; vpc: string; subnets: string[] }[]
      rules?: FirewallRuleGroupConfig[]
    }
    route53Resolver?: {
      endpoints?: Route53ResolverEndpointConfig[]
      rules?: Route53ResolverRuleConfig[]
      firewallRuleGroups?: DnsFirewallRuleGroupConfig[]
      queryLogs?: unknown[]
    }
  }
}

// ── Security config ────────────────────────────────────────────────────────────

export interface SecurityConfig {
  enableDlpChecks?: boolean
  centralSecurityServices?: {
    delegatedAdminAccount?: string
    macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
    guardDuty?: { enable: boolean; s3Protection?: { enable: boolean } }
    securityHub?: { enable: boolean; standards?: (string | { name: string })[] }
    config?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
    inspector?: { enable: boolean; enableScanTypes?: string[] }
    detective?: { enable: boolean }
    auditManager?: { enable: boolean }
    accessAnalyzer?: { enable: boolean }
    cloudtrail?: { enable: boolean; organizationTrail?: boolean; s3BucketName?: string }
  }
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

// ── Account-level IAM (roles/users/groups/policies) ────────────────────────────
// Distinct from Identity Center above — these are IAM resources LZA provisions
// directly inside member accounts via roleSets/userSets/groupSets/policySets.

export interface IamPolicyAttachments {
  awsManaged?: string[]
  customerManaged?: string[]
}

export interface DeploymentTargets {
  organizationalUnits?: string[]
  accounts?: string[]
}

export interface IamPolicyConfig {
  name: string
  policy: string
}

export interface PolicySetConfig {
  name?: string
  deploymentTargets?: DeploymentTargets
  policies?: IamPolicyConfig[]
}

export interface IamRoleConfig {
  name: string
  assumedBy?: { type: string; principal?: string }[]
  policies?: IamPolicyAttachments
  boundaryPolicy?: string
  instanceProfile?: boolean
}

export interface RoleSetConfig {
  name?: string
  path?: string
  deploymentTargets?: DeploymentTargets
  roles?: IamRoleConfig[]
}

export interface IamGroupConfig {
  name: string
  policies?: IamPolicyAttachments
}

export interface GroupSetConfig {
  name?: string
  deploymentTargets?: DeploymentTargets
  groups?: IamGroupConfig[]
}

export interface IamUserConfig {
  username: string
  group?: string
  boundaryPolicy?: string
}

export interface UserSetConfig {
  name?: string
  deploymentTargets?: DeploymentTargets
  users?: IamUserConfig[]
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
  policySets?: PolicySetConfig[]
  roleSets?: RoleSetConfig[]
  groupSets?: GroupSetConfig[]
  userSets?: UserSetConfig[]
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
  snsTopics?: { name: string; emailAddresses?: string[] }[]
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

export interface ServiceCatalogPortfolioConfig {
  name: string
  description?: string
  provider?: string
  regions?: string[]
  deploymentTargets?: CfnDeploymentTargets
  products?: { name: string; version: string; description?: string }[]
}

export interface CustomizationConfigBlock {
  cloudFormationStacks?: CfnStackConfig[]
  cloudFormationStackSets?: CfnStackConfig[]
  serviceCatalogPortfolios?: ServiceCatalogPortfolioConfig[]
}

// LZA's customizations-config.yaml nests the stack/portfolio lists under a
// `customizations:` key (alongside a top-level `applications:`). Hand-written
// configs sometimes put those lists at the top level instead, so both layouts
// are accepted — the parser reads `customizations` first, then falls back flat.
export interface CustomizationsConfig extends CustomizationConfigBlock {
  customizations?: CustomizationConfigBlock
  applications?: unknown[]
}

// ── Parsed graph model ────────────────────────────────────────────────────────

export type NodeKind =
  | 'root' | 'ou' | 'account' | 'region' | 'on-premises'
  | 'vpc' | 'subnet' | 'subnet-public' | 'subnet-private' | 'subnet-firewall' | 'subnet-tgw'
  | 'tgw' | 'tgw-rt-group' | 'tgw-rt' | 'vpn' | 'cgw' | 'dx'
  | 'nlb' | 'alb' | 'network-firewall' | 'nat-gateway' | 'igw'
  | 'route53' | 'cloudwatch' | 'cloudtrail' | 'config' | 'organizations' | 'control-tower'
  | 'security-hub' | 'guardduty' | 'inspector' | 'macie' | 'iam' | 'acm' | 'kms'
  | 'detective' | 'audit-manager' | 'access-analyzer' | 'firewall-manager' | 's3' | 'backup' | 'lambda' | 'service'
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
  kind?: 'tgw' | 'tgw-hub' | 'vpn' | 'dx' | 'peering' | 'flow' | 'propagation'
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
