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
  /** LZA attaches `scpPolicyName` to newly created accounts automatically, so
   *  that policy legitimately has no deploymentTargets of its own. */
  quarantineNewAccounts?: { enable?: boolean; scpPolicyName?: string }
  serviceControlPolicies?: SCP[]
  // Resource control, tagging and backup policies all use the same
  // {name, description, policy, deploymentTargets} shape as SCPs in LZA's
  // organization-config.yaml.
  resourceControlPolicies?: SCP[]
  taggingPolicies?: SCP[]
  backupPolicies?: SCP[]
}

export interface SubnetConfig {
  name: string
  availabilityZone?: string | number
  routeTable?: string
  ipv4CidrBlock?: string
  ipv6CidrBlock?: string
  localZone?: string
  mapPublicIpOnLaunch?: boolean
  /** RAM sharing: which accounts/OUs this subnet is shared with. A shared
   *  subnet belongs to the VPC owner but is used by the target accounts, so it
   *  shows up in both accounts' profiles. */
  shareTargets?: DeploymentTargets
  tags?: Record<string, string>[]
}

/** Route table a subnet points at by name, and the routes it carries. LZA
 *  defines these per VPC; `subnet.routeTable` is a reference into this list. */
export type RouteTableEntryType =
  | 'transitGateway' | 'natGateway' | 'internetGateway' | 'egressOnlyIgw'
  | 'virtualPrivateGateway' | 'vpcPeering' | 'networkFirewall'
  | 'gatewayLoadBalancerEndpoint' | 'networkInterface' | 'localGateway'
  | 'gatewayEndpoint'

export interface RouteTableEntryConfig {
  name: string
  destination?: string
  ipv6Destination?: string
  destinationPrefixList?: string
  type?: RouteTableEntryType | string
  target?: string
  targetAvailabilityZone?: string | number
}

export interface RouteTableConfig {
  name: string
  gatewayAssociation?: string
  routes?: RouteTableEntryConfig[]
  tags?: Record<string, string>[]
}

/** Flow logs can be set once for every VPC at the top of network-config, or
 *  per VPC; a VPC-level block overrides the default. */
export interface VpcFlowLogsConfig {
  trafficType?: string
  maxAggregationInterval?: number
  destinations?: string[]
  destinationsConfig?: Record<string, unknown>
  defaultFormat?: boolean
  customFields?: string[]
}

/**
 * LZA declares route table associations and propagations as plain arrays of
 * route table names (`ITransitGatewayAttachmentConfig.routeTableAssociations:
 * string[]`). Some hand-written configs use `- routeTableName: X` objects
 * instead, so both are accepted and normalised by `routeTableNames()`.
 */
export type RouteTableRef = string | { routeTableName?: string }

export interface TgwAttachmentConfig {
  name: string
  transitGateway: { name: string; account: string }
  routeTableAssociations?: RouteTableRef[]
  routeTablePropagations?: RouteTableRef[]
  subnets?: string[]
}

export interface VpcConfig {
  name: string
  account: string
  region: string
  /** Optional in LZA: a VPC carved from IPAM has `ipamAllocations` instead. */
  cidrs?: string[]
  ipv6Cidrs?: unknown[]
  egressOnlyIgw?: boolean
  internetGateway?: boolean
  enableDnsHostnames?: boolean
  enableDnsSupport?: boolean
  interfaceEndpoints?: { central?: boolean; endpoints?: { service: string }[]; subnets?: string[] }
  gatewayEndpoints?: { defaultPolicy?: string; endpoints?: { service: string }[] }
  useCentralEndpoints?: boolean
  resolverRules?: string[]
  dnsFirewallRuleGroups?: string[]
  subnets?: SubnetConfig[]
  routeTables?: RouteTableConfig[]
  vpcFlowLogs?: VpcFlowLogsConfig
  transitGatewayAttachments?: TgwAttachmentConfig[]
  natGateways?: { name: string; subnet: string }[]
  loadBalancers?: {
    applicationLoadBalancers?: { name: string; subnets: string[] }[]
    networkLoadBalancers?: { name: string; subnets: string[] }[]
  }
  tags?: Record<string, string>[]
}

/**
 * A VPC deployed into every account a `deploymentTargets` block resolves to.
 *
 * Identical to a VPC except that it names no `account` of its own — LZA builds
 * one VPC per target account from the same definition. The Universal
 * Configuration declares all of its workload VPCs this way, so a reader that
 * only looks at `vpcs` sees the hub and none of the spokes.
 */
export interface VpcTemplateConfig extends Omit<VpcConfig, 'account'> {
  deploymentTargets?: DeploymentTargets
}

export interface TgwConfig {
  name: string
  account: string
  region: string
  asn?: number
  defaultRouteTableAssociation?: string
  defaultRouteTablePropagation?: string
  autoAcceptSharingAttachments?: string
  /** LZA nests route tables under their Transit Gateway. The top-level
   *  `transitGatewayRouteTables` list is accepted too, but this is canonical. */
  routeTables?: TgwRouteTableConfig[]
  shareTargets?: { organizationalUnits?: string[]; accounts?: string[] }
  tags?: Record<string, string>[]
}

/** A static route on a Transit Gateway route table. `attachment` names the VPC
 *  (or VPN/DX) the traffic is steered to — the mechanism a hub-and-spoke
 *  inspection design uses instead of propagation. */
export interface TgwRouteEntryConfig {
  destinationCidrBlock?: string
  destinationPrefixList?: string
  blackhole?: boolean
  attachment?: {
    vpcName?: string
    account?: string
    vpnConnectionName?: string
    directConnectGatewayName?: string
    transitGatewayPeeringName?: string
  }
}

export interface TgwRouteTableConfig {
  name: string
  /** Present when the route table is declared at the top level rather than
   *  nested under its Transit Gateway. */
  transitGateway?: { name: string; account: string }
  routes?: TgwRouteEntryConfig[]
  tags?: Record<string, string>[]
}

export interface VpnTunnelSpec {
  tunnelInsideCidr: string
}

export interface VpnConnectionConfig {
  name: string
  transitGateway: string
  routeTableAssociations?: RouteTableRef[]
  routeTablePropagations?: RouteTableRef[]
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
  /** Minutes. LZA takes a number here, not an ISO 8601 duration. */
  sessionDuration?: number | string
  policies?: IamPolicyAttachments & { inlinePolicy?: string; acceleratorManaged?: string[] }
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
  /** Current LZA shape. */
  principals?: { type?: string; name?: string }[]
  /** Older shape, still accepted by LZA. */
  principalType?: 'GROUP' | 'USER' | string
  principalId?: string
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
  /** Applies to every VPC that doesn't set its own `vpcFlowLogs`. */
  vpcFlowLogs?: VpcFlowLogsConfig
  vpcs?: VpcConfig[]
  vpcTemplates?: VpcTemplateConfig[]
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

/** LZA enables a security service org-wide and opts individual regions out,
 *  rather than listing the regions it should run in. */
export interface SecurityService {
  enable?: boolean
  excludeRegions?: string[]
}

export interface SecurityConfig {
  enableDlpChecks?: boolean
  centralSecurityServices?: {
    delegatedAdminAccount?: string
    macie?: SecurityService & { policyFindingsPublishingFrequency?: string }
    guardduty?: SecurityService & { s3Protection?: SecurityService }
    /** Tolerated misspelling of `guardduty`; LZA itself uses the lowercase d. */
    guardDuty?: SecurityService & { s3Protection?: SecurityService }
    securityHub?: SecurityService & { standards?: (string | { name: string })[] }
    config?: SecurityService & { enableConfigurationRecorder?: boolean; enableDeliveryChannel?: boolean }
    inspector?: SecurityService & { enableScanTypes?: string[] }
    detective?: SecurityService
    auditManager?: SecurityService
    accessAnalyzer?: SecurityService
    cloudtrail?: SecurityService & { organizationTrail?: boolean; s3BucketName?: string }
  }
  macie?: SecurityService & { policyFindingsPublishingFrequency?: string }
  guardduty?: SecurityService & { s3Protection?: { enable: boolean } }
  securityHub?: SecurityService & { standards?: (string | { name: string })[] }
  awsConfig?: SecurityService & { enableConfigurationRecorder?: boolean; enableDeliveryChannel?: boolean }
  cloudwatch?: SecurityService
  cloudtrail?: SecurityService & { organizationTrail?: boolean; s3BucketName?: string }
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
    /** Where LZA declares them. */
    identityCenterPermissionSets?: PermissionSetConfig[]
    identityCenterAssignments?: IdentityCenterAssignmentConfig[]
    [key: string]: unknown
  }
  /** Top-level forms, accepted but not what LZA writes. */
  permissionSets?: PermissionSetConfig[]
  identityCenterAssignments?: IdentityCenterAssignmentConfig[]
  providers?: unknown[]
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

/** A portfolio is created in one account and shared out, rather than deployed
 *  per target the way a stack is — so it carries `account` and `shareTargets`,
 *  not `deploymentTargets`. */
export interface ServiceCatalogPortfolioConfig {
  name: string
  account?: string
  provider?: string
  regions?: string[]
  shareTargets?: CfnDeploymentTargets
  portfolioAssociations?: { type?: string; name?: string; propagateAssignment?: boolean }[]
  products?: {
    name: string
    owner?: string
    description?: string
    versions?: { name: string; template: string; description?: string }[]
  }[]
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
