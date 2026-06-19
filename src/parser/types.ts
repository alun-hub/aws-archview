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

export interface NetworkConfig {
  defaultVpc?: { delete: boolean }
  vpcs?: VpcConfig[]
  transitGateways?: TgwConfig[]
  transitGatewayRouteTables?: TgwRouteTableConfig[]
  customerGateways?: CustomerGatewayConfig[]
}

// ── Security config ────────────────────────────────────────────────────────────

export interface SecurityConfig {
  enableDlpChecks?: boolean
  macie?: { enable: boolean; policyFindingsPublishingFrequency?: string }
  guardduty?: { enable: boolean; s3Protection?: { enable: boolean } }
  securityHub?: { enable: boolean }
  awsConfig?: { enableConfigurationRecorder: boolean; enableDeliveryChannel?: boolean }
  cloudwatch?: { enable?: boolean }
  cloudtrail?: { enable: boolean }
}

// ── IAM config ────────────────────────────────────────────────────────────────

export interface IamPermissionSet {
  name: string
  description?: string
  sessionDuration?: string
  policies?: unknown[]
}

export interface IamConfig {
  permissionSets?: IamPermissionSet[]
  identityCenter?: { enable: boolean }
}

// ── Parsed graph model ────────────────────────────────────────────────────────

export type NodeKind =
  | 'root' | 'ou' | 'account' | 'on-premises'
  | 'vpc' | 'subnet' | 'subnet-public' | 'subnet-private' | 'subnet-firewall' | 'subnet-tgw'
  | 'tgw' | 'tgw-rt-group' | 'tgw-rt' | 'vpn' | 'cgw' | 'dx'
  | 'nlb' | 'alb' | 'network-firewall' | 'nat-gateway' | 'igw'
  | 'route53' | 'cloudwatch' | 'cloudtrail' | 'config' | 'organizations' | 'control-tower'
  | 'security-hub' | 'guardduty' | 'inspector' | 'macie' | 'iam' | 'acm' | 'kms'
  | 'detective' | 'audit-manager' | 'firewall-manager' | 's3' | 'backup' | 'lambda' | 'service'

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
  kind?: 'tgw' | 'tgw-hub' | 'vpn' | 'peering' | 'flow'
}

export interface GraphModel {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
