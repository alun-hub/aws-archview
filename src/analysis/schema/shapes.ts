// ─── Structural descriptors for LZA config files ─────────────────────────────
//
// Deliberately NOT a schema in the ajv/zod sense, and deliberately not derived
// from `parser/types.ts`. Two different jobs:
//
//   types.ts   compile-time shape of what the parsers read. Partial by design —
//              it models the parts the diagram needs and ignores the rest.
//   this file  runtime knowledge used to spot *typos*: which key names are
//              real, and which handful of fields the parsers cannot work
//              without.
//
// The distinction matters because LZA's real schema is far larger than what
// this app models. Flagging every key we don't know would bury a user's config
// in warnings that are all our fault. So `keys` is used only to catch
// near-misses ("cidr" vs "cidrs"), never for completeness, and `required` lists
// only fields whose absence actually breaks a view.

export interface Shape {
  /** Human name for messages: "VPC", "subnet", "service control policy". */
  label: string
  /** Field that identifies one item in messages. */
  nameKey?: string
  /** Known key names at this level. Used for near-miss typo detection only. */
  keys: string[]
  /** Fields the parsers genuinely cannot proceed without. Keep this short. */
  required?: string[]
  /** Nested shapes, by the key holding them. `list` marks an array of items. */
  children?: Record<string, { list?: boolean; shape: Shape }>
}

const DEPLOYMENT_TARGET_KEYS = ['organizationalUnits', 'accounts', 'excludedAccounts', 'excludedRegions']

const routeTableRef: Shape = {
  label: 'route table reference',
  nameKey: 'routeTableName',
  keys: ['routeTableName'],
  required: ['routeTableName'],
}

const subnet: Shape = {
  label: 'subnet',
  nameKey: 'name',
  // ipamAllocation is an alternative to ipv4CidrBlock, which is why neither
  // is required — a subnet can legitimately carry only one of them.
  keys: [
    'name', 'availabilityZone', 'routeTable', 'ipv4CidrBlock', 'ipamAllocation',
    'mapPublicIpOnLaunch', 'shareTargets', 'tags', 'outpost', 'assignIpv6OnCreation',
    'ipv6CidrBlock', 'enableDns64', 'privateDnsOptions',
  ],
  required: ['name'],
}

const tgwAttachment: Shape = {
  label: 'Transit Gateway attachment',
  nameKey: 'name',
  keys: [
    'name', 'transitGateway', 'subnets', 'routeTableAssociations', 'routeTablePropagations',
    'options', 'tags',
  ],
  required: ['name', 'transitGateway'],
  children: {
    routeTableAssociations: { list: true, shape: routeTableRef },
    routeTablePropagations: { list: true, shape: routeTableRef },
  },
}

const vpc: Shape = {
  label: 'VPC',
  nameKey: 'name',
  // cidrs is absent when the VPC is carved from IPAM, so it is not required.
  keys: [
    'name', 'account', 'region', 'cidrs', 'ipamAllocations', 'internetGateway',
    'enableDnsHostnames', 'enableDnsSupport', 'instanceTenancy', 'defaultSecurityGroupRulesDeletion',
    'dhcpOptions', 'dnsFirewallRuleGroups', 'queryLogs', 'resolverRules',
    'interfaceEndpoints', 'gatewayEndpoints', 'useCentralEndpoints',
    'subnets', 'natGateways', 'transitGatewayAttachments', 'routeTables',
    'securityGroups', 'networkAcls', 'loadBalancers', 'targetGroups',
    'virtualPrivateGateway', 'vpcFlowLogs', 'vpcRoute53Resolver', 'outposts',
    'tags',
  ],
  required: ['name', 'account', 'region'],
  children: {
    subnets: { list: true, shape: subnet },
    transitGatewayAttachments: { list: true, shape: tgwAttachment },
  },
}

const transitGateway: Shape = {
  label: 'Transit Gateway',
  nameKey: 'name',
  keys: [
    'name', 'account', 'region', 'asn', 'dnsSupport', 'vpnEcmpSupport',
    'defaultRouteTableAssociation', 'defaultRouteTablePropagation',
    'autoAcceptSharingAttachments', 'routeTables', 'shareTargets', 'tags',
  ],
  required: ['name', 'account', 'region'],
  children: {
    shareTargets: { shape: { label: 'shareTargets', keys: DEPLOYMENT_TARGET_KEYS } },
  },
}

const vpnConnection: Shape = {
  label: 'VPN connection',
  nameKey: 'name',
  keys: [
    'name', 'transitGateway', 'vpc', 'staticRoutesOnly', 'routeTableAssociations',
    'routeTablePropagations', 'tunnelSpecifications', 'amazonIpv4NetworkCidr',
    'customerIpv4NetworkCidr', 'enableVpnAcceleration', 'tags',
  ],
  required: ['name'],
  children: {
    routeTableAssociations: { list: true, shape: routeTableRef },
    routeTablePropagations: { list: true, shape: routeTableRef },
  },
}

const customerGateway: Shape = {
  label: 'customer gateway',
  nameKey: 'name',
  keys: ['name', 'account', 'region', 'ipAddress', 'asn', 'vpnConnections', 'tags'],
  required: ['name', 'account', 'region'],
  children: { vpnConnections: { list: true, shape: vpnConnection } },
}

export const NETWORK_SHAPE: Shape = {
  label: 'network-config.yaml',
  keys: [
    'homeRegion', 'defaultVpc', 'endpointPolicies', 'vpcs', 'vpcTemplates', 'vpcPeering',
    'transitGateways', 'transitGatewayRouteTables', 'transitGatewayConnects',
    'customerGateways', 'directConnectGateways', 'dhcpOptions', 'prefixLists',
    'centralNetworkServices', 'firewallManagerService', 'certificates', 'elbAccountIds',
  ],
  children: {
    vpcs: { list: true, shape: vpc },
    vpcTemplates: { list: true, shape: vpc },
    transitGateways: { list: true, shape: transitGateway },
    customerGateways: { list: true, shape: customerGateway },
    transitGatewayRouteTables: {
      list: true,
      shape: {
        label: 'Transit Gateway route table',
        nameKey: 'name',
        keys: ['name', 'transitGateway', 'routes', 'tags'],
        required: ['name'],
      },
    },
    vpcPeering: {
      list: true,
      shape: { label: 'VPC peering', nameKey: 'name', keys: ['name', 'vpcs', 'tags'], required: ['name', 'vpcs'] },
    },
  },
}

const organizationalUnit: Shape = {
  label: 'organizational unit',
  nameKey: 'name',
  keys: ['name', 'ignore', 'organizationalUnits', 'tags'],
  required: ['name'],
}
// Nested OUs share the shape; wire the recursion after the object exists.
organizationalUnit.children = { organizationalUnits: { list: true, shape: organizationalUnit } }

const policy: Shape = {
  label: 'policy',
  nameKey: 'name',
  keys: ['name', 'description', 'policy', 'type', 'strategy', 'deploymentTargets'],
  required: ['name'],
  children: { deploymentTargets: { shape: { label: 'deploymentTargets', keys: DEPLOYMENT_TARGET_KEYS } } },
}

export const ORGANIZATION_SHAPE: Shape = {
  label: 'organization-config.yaml',
  keys: [
    'enable', 'organizationalUnits', 'quarantineNewAccounts', 'serviceControlPolicies',
    'taggingPolicies', 'backupPolicies', 'chatbotPolicies', 'declarativePolicies',
  ],
  children: {
    organizationalUnits: { list: true, shape: organizationalUnit },
    serviceControlPolicies: { list: true, shape: policy },
    taggingPolicies: { list: true, shape: policy },
    backupPolicies: { list: true, shape: policy },
  },
}

const account: Shape = {
  label: 'account',
  nameKey: 'name',
  keys: ['name', 'description', 'email', 'organizationalUnit', 'warm', 'tags'],
  required: ['name', 'email'],
}

export const ACCOUNTS_SHAPE: Shape = {
  label: 'accounts-config.yaml',
  keys: ['mandatoryAccounts', 'workloadAccounts', 'accountIds'],
  children: {
    mandatoryAccounts: { list: true, shape: account },
    workloadAccounts: { list: true, shape: account },
  },
}

const cfnDeployable: Shape = {
  label: 'customization',
  nameKey: 'name',
  keys: [
    'name', 'description', 'regions', 'deploymentTargets', 'template', 'runOrder',
    'terminationProtection', 'parameters', 'tags', 'provider', 'products', 'capabilities',
  ],
  required: ['name'],
  children: { deploymentTargets: { shape: { label: 'deploymentTargets', keys: DEPLOYMENT_TARGET_KEYS } } },
}

const customizationBlock: Shape = {
  label: 'customizations',
  keys: ['cloudFormationStacks', 'cloudFormationStackSets', 'serviceCatalogPortfolios'],
  children: {
    cloudFormationStacks: { list: true, shape: cfnDeployable },
    cloudFormationStackSets: { list: true, shape: cfnDeployable },
    serviceCatalogPortfolios: { list: true, shape: cfnDeployable },
  },
}

export const CUSTOMIZATIONS_SHAPE: Shape = {
  label: 'customizations-config.yaml',
  keys: ['customizations', 'applications', 'firewalls', ...customizationBlock.keys],
  children: {
    customizations: { shape: customizationBlock },
    ...customizationBlock.children,
  },
}

/** Config files whose structure is described above. The others (global,
 *  security, iam) are modelled too thinly here for near-miss detection to be
 *  worth the false positives, so they are left out rather than half-covered. */
export const SHAPES = {
  network: NETWORK_SHAPE,
  organization: ORGANIZATION_SHAPE,
  accounts: ACCOUNTS_SHAPE,
  customizations: CUSTOMIZATIONS_SHAPE,
} as const
