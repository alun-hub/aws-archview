import { useState, useMemo } from 'react'
import Modal from '@cloudscape-design/components/modal'
import Table from '@cloudscape-design/components/table'
import type { TableProps } from '@cloudscape-design/components/table'
import Box from '@cloudscape-design/components/box'
import Button from '@cloudscape-design/components/button'
import Input from '@cloudscape-design/components/input'
import Header from '@cloudscape-design/components/header'
import SpaceBetween from '@cloudscape-design/components/space-between'
import { useConfig } from '../../store/configStore'
import type { PermissionSetConfig, IdentityCenterAssignmentConfig, FirewallRuleGroupConfig, CfnStackConfig } from '../../parser/types'
import type { GraphNode } from '../../parser'

interface StackEntry extends CfnStackConfig {
  isStackSet: boolean
}

const KIND_LABEL: Record<string, string> = {
  root:           'Organization Root',
  ou:             'Organizational Unit',
  account:        'AWS Account',
  vpc:            'VPC',
  subnet:         'Subnet',
  'subnet-public':  'Public Subnet',
  'subnet-private': 'Private Subnet',
  'subnet-firewall':'Firewall Subnet',
  'subnet-tgw':     'TGW Attachment Subnet',
  tgw:            'Transit Gateway',
  'tgw-rt-group': 'Route Table Group',
  'tgw-rt':       'TGW Route Table',
  vpn:            'VPN Connection',
  cgw:            'Customer Gateway',
  igw:            'Internet Gateway',
  'nat-gateway':   'NAT Gateway',
  'network-firewall': 'Network Firewall',
  nlb:            'Network Load Balancer',
  alb:            'Application Load Balancer',
  'on-premises':  'On-Premises',
  'security-hub': 'Security Hub',
  guardduty:      'GuardDuty',
  macie:          'Macie',
  config:         'AWS Config',
  cloudtrail:     'CloudTrail',
  iam:            'IAM Identity Center',
  service:           'AWS Service',
  cloud:             'AWS Global Config',
  cloudformation:    'CloudFormation Stack',
  'service-catalog': 'Service Catalog Portfolio',
  'control-tower':   'Control Tower',
  backup:            'AWS Backup',
}

const KIND_COLOR: Record<string, string> = {
  root:           '#E7157B',
  ou:             '#E7157B',
  account:        '#FF9900',
  'management-account': '#FF9900',
  vpc:            '#8C4FFF',
  'subnet-public':  '#248814',
  'subnet-private': '#1A6CAE',
  'subnet-firewall':'#CC3300',
  'subnet-tgw':     '#6B3FA0',
  tgw:            '#6B3FA0',
  'tgw-rt-group': '#6B3FA0',
  'tgw-rt':       '#6B3FA0',
  vpn:            '#CC7700',
  cgw:            '#CC7700',
  igw:            '#007DB8',
  'nat-gateway':   '#007DB8',
  'network-firewall': '#CC3300',
  nlb:            '#007DB8',
  alb:            '#007DB8',
  'on-premises':  '#5A5A5A',
  'security-hub': '#CD2264',
  guardduty:      '#CD2264',
  macie:          '#CD2264',
  config:         '#CD2264',
  cloudtrail:     '#CD2264',
  iam:               '#CD2264',
  cloud:             '#232F3E',
  cloudformation:    '#E7157B',
  'service-catalog': '#E7157B',
  'control-tower':   '#232F3E',
  backup:            '#007DB8',
}

// Human-readable labels for known data keys
const FIELD_LABEL: Record<string, string> = {
  kind:             'Type',
  account:          'Account',
  region:           'Region',
  asn:              'ASN',
  cidrs:            'CIDRs',
  internetGateway:  'Internet Gateway',
  subnets:          'Subnets',
  azs:              'Availability Zones',
  ip:               'IP Address',
  staticRoutes:     'Static Routes Only',
  tgw:              'Transit Gateway',
  routeTables:      'Route Tables',
  associations:     'Associations',
  propagatesFrom:   'Propagations (from)',
  sublabel:         'Account',
  cidr:             'CIDR Block',
  az:               'Availability Zone',
  routeTable:       'Route Table',
  email:            'Email Address',
  scps:             'Service Control Policies (SCPs)',
  s3Protection:      'S3 Protection',
  standards:         'Enabled Standards',
  publishingFrequency: 'Macie Findings Frequency',
  recorderEnabled:   'Configuration Recorder',
  deliveryChannel:   'Delivery Channel',
  permissionSets:    'IAM Permission Sets',
  trailEnabled:      'CloudTrail Active',
  tunnels:           'VPN Tunnels',
  vpcs:              'VPCs',
  organizationTrail: 'Organization Trail',
  s3BucketName:      'S3 Log Bucket',
  iamAssignments:    'IAM Assignments',
  // Global config fields
  homeRegion:        'Home Region',
  enabledRegions:    'Enabled Regions',
  logRetentionDays:  'Log Retention (days)',
  managementRole:    'Management Access Role',
  mandatoryTags:     'Mandatory Tags',
  vaults:            'Backup Vaults',
  enabled:           'Enabled',
  budgets:           'Budgets',
  // Customizations fields
  isStackSet:        'Stack Set',
  description:       'Description',
  template:          'Template File',
  regions:           'Regions',
  parameters:        'Parameters',
  provider:          'Provider',
}

// Keys to skip from raw data (shown separately or irrelevant)
const SKIP_KEYS = new Set(['kind', 'sublabel', 'rules', 'isAggregate', 'stacks'])

interface FlattenedRule {
  type: string
  groupName: string
  action: string
  protocol: string
  source: string
  destination: string
  direction: string
  description?: string
}

function getFlattenedRules(rulesConfig: unknown): FlattenedRule[] {
  if (!Array.isArray(rulesConfig) || rulesConfig.length === 0) {
    return []
  }

  const groups = rulesConfig as FirewallRuleGroupConfig[]
  const flattened: FlattenedRule[] = []

  for (const group of groups) {
    const groupName = group.name || 'Unnamed Group'
    const type = group.type || 'STATEFUL'
    const rulesSource = group.ruleGroup?.rulesSource

    if (!rulesSource) continue

    // Stateful Rules
    if (Array.isArray(rulesSource.statefulRules)) {
      for (const r of rulesSource.statefulRules) {
        flattened.push({
          type: 'STATEFUL',
          groupName,
          action: r.action || 'PASS',
          protocol: r.header?.protocol || 'ANY',
          source: `${r.header?.source || 'ANY'}:${r.header?.sourcePort || 'ANY'}`,
          destination: `${r.header?.destination || 'ANY'}:${r.header?.destinationPort || 'ANY'}`,
          direction: r.header?.direction || 'FORWARD',
          description: r.ruleOptions?.find(o => o.keyword === 'msg')?.settings?.[0] || ''
        })
      }
    }

    // Stateless Rules
    if (rulesSource.statelessRulesAndCustomActions?.statelessRules) {
      const stateless = rulesSource.statelessRulesAndCustomActions.statelessRules
      if (Array.isArray(stateless)) {
        for (const r of stateless) {
          const action = r.ruleDefinition?.actions?.join(', ') || 'PASS'
          const sources = r.ruleDefinition?.matchAttributes?.sources?.map(s => s.addressDefinition).join(', ') || 'ANY'
          const destinations = r.ruleDefinition?.matchAttributes?.destinations?.map(d => d.addressDefinition).join(', ') || 'ANY'
          
          const protocolsMap: Record<number, string> = { 6: 'TCP', 17: 'UDP', 1: 'ICMP', 58: 'ICMPv6' }
          const rawProtos = r.ruleDefinition?.matchAttributes?.protocols
          const protocol = Array.isArray(rawProtos) ? rawProtos.map((p: number) => protocolsMap[p] || String(p)).join(', ') : 'ALL'

          const sourcePorts = r.ruleDefinition?.matchAttributes?.sourcePorts?.map(p => `${p.fromPort}-${p.toPort}`).join(', ') || 'ANY'
          const destPorts = r.ruleDefinition?.matchAttributes?.destinationPorts?.map(p => `${p.fromPort}-${p.toPort}`).join(', ') || 'ANY'

          flattened.push({
            type: 'STATELESS',
            groupName,
            action,
            protocol,
            source: `${sources}:${sourcePorts}`,
            destination: `${destinations}:${destPorts}`,
            direction: 'ANY',
            description: `Priority: ${r.priority}`
          })
        }
      }
    }

    // External rule file
    if (rulesSource.rulesFile) {
      flattened.push({
        type: type,
        groupName,
        action: 'REFERENCED',
        protocol: '-',
        source: '-',
        destination: '-',
        direction: '-',
        description: `External rules file: ${rulesSource.rulesFile}`
      })
    }
  }

  return flattened
}

const MOCK_FIREWALL_RULES: FlattenedRule[] = [
  {
    type: 'STATEFUL',
    groupName: 'LZA-Core-Stateful-Rules',
    action: 'PASS',
    protocol: 'TCP',
    source: '10.0.0.0/8:Any',
    destination: '0.0.0.0/0:80,443',
    direction: 'FORWARD',
    description: 'Allow HTTP/HTTPS traffic from local network to internet'
  },
  {
    type: 'STATEFUL',
    groupName: 'LZA-Core-Stateful-Rules',
    action: 'DROP',
    protocol: 'TCP',
    source: '0.0.0.0/0:Any',
    destination: '10.0.0.0/8:22,3389',
    direction: 'FORWARD',
    description: 'Block inbound SSH and RDP from external networks'
  },
  {
    type: 'STATEFUL',
    groupName: 'LZA-Core-Stateful-Rules',
    action: 'PASS',
    protocol: 'UDP',
    source: '10.0.0.0/8:Any',
    destination: '8.8.8.8/32:53',
    direction: 'FORWARD',
    description: 'Allow DNS queries to Google Public DNS'
  },
  {
    type: 'STATELESS',
    groupName: 'LZA-Stateless-Default',
    action: 'aws:forward_to_sfe',
    protocol: 'ALL',
    source: '0.0.0.0/0:Any',
    destination: '0.0.0.0/0:Any',
    direction: 'BIDIRECTIONAL',
    description: 'Forward all default traffic to stateful inspection engine'
  }
]


interface Props {
  node: GraphNode | null
}

function Row({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null

  if (Array.isArray(value)) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          {label}
        </div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {(value as unknown[]).map((item, i) => (
            <li key={i} style={{ fontSize: 12, color: '#232F3E', marginBottom: 2 }}>
              {String(item)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#232F3E', wordBreak: 'break-all' }}>
        {display}
      </div>
    </div>
  )
}

export function DetailPanel({ node }: Props) {
  const config = useConfig()
  const [modalOpen, setModalOpen] = useState(false)
  const [filteringText, setFilteringText] = useState('')
  const [sortingColumn, setSortingColumn] = useState<'principal' | 'role' | null>(null)
  const [sortingDescending, setSortingDescending] = useState<boolean>(false)

  const [fwModalOpen, setFwModalOpen] = useState(false)
  const [fwFilteringText, setFwFilteringText] = useState('')

  const [stacksModalOpen, setStacksModalOpen] = useState(false)
  const [stacksFilteringText, setStacksFilteringText] = useState('')

  const isFirewall = node?.kind === 'network-firewall'
  const parsedFwRules = useMemo(() => {
    if (!isFirewall || !node) return { isSample: false, rules: [] }
    const rawRules = node.data.rules
    const flattened = getFlattenedRules(rawRules)
    return flattened.length > 0 ? { isSample: false, rules: flattened } : { isSample: true, rules: MOCK_FIREWALL_RULES }
  }, [node, isFirewall])

  const fwColumns: TableProps<FlattenedRule>['columnDefinitions'] = useMemo(() => [
    {
      id: 'type',
      header: 'Type',
      cell: item => (
        <Box variant="span" color={item.type === 'STATEFUL' ? 'text-status-info' : 'text-status-warning'}>
          {item.type}
        </Box>
      ),
    },
    {
      id: 'group',
      header: 'Rule Group',
      cell: item => item.groupName,
    },
    {
      id: 'action',
      header: 'Action',
      cell: item => (
        <Box variant="span" fontWeight="bold" color={
          item.action === 'PASS' || item.action.includes('forward') ? 'text-status-success' :
          item.action === 'DROP' ? 'text-status-error' : 'text-label'
        }>
          {item.action}
        </Box>
      ),
    },
    {
      id: 'protocol',
      header: 'Protocol',
      cell: item => item.protocol,
    },
    {
      id: 'source',
      header: 'Source',
      cell: item => item.source,
    },
    {
      id: 'destination',
      header: 'Destination',
      cell: item => item.destination,
    },
    {
      id: 'direction',
      header: 'Direction',
      cell: item => item.direction,
    },
    {
      id: 'description',
      header: 'Description / Options',
      cell: item => item.description || '-',
    }
  ], [])

  const filteredFwRules = useMemo(() => {
    const result = parsedFwRules.rules || []
    if (fwFilteringText.trim()) {
      const q = fwFilteringText.toLowerCase()
      return result.filter(r =>
        r.groupName.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        r.protocol.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      )
    }
    return result
  }, [parsedFwRules, fwFilteringText])

  const iamConfig = config.configs.iam

  const matchingAssignments = useMemo(() => {
    if (!node || !iamConfig?.identityCenterAssignments) return []

    const nodeKind = node.kind
    const nodeLabel = node.label

    // Resolve all OUs in the account's path
    const ouNames: string[] = ['Root']
    if (nodeKind === 'account') {
      const accountNode = config.configs.accounts?.mandatoryAccounts?.find(a => a.name === nodeLabel)
        || config.configs.accounts?.workloadAccounts?.find(a => a.name === nodeLabel)
      if (accountNode?.organizationalUnit) {
        ouNames.push(accountNode.organizationalUnit)
        const parts = accountNode.organizationalUnit.split('/')
        for (const p of parts) {
          if (p && !ouNames.includes(p)) ouNames.push(p)
        }
      }
    }

    return iamConfig.identityCenterAssignments.filter(assignment => {
      const targets = assignment.deploymentTargets
      if (nodeKind === 'account') {
        const directMatch = targets.accounts?.includes(nodeLabel)
        const inheritedMatch = targets.organizationalUnits?.some(ou => ouNames.includes(ou))
        return directMatch || inheritedMatch
      } else if (nodeKind === 'ou') {
        return targets.organizationalUnits?.includes(nodeLabel)
      }
      return false
    })
  }, [node, iamConfig, config.configs])

  const permissionSetsMap = useMemo(() => {
    const map = new Map<string, PermissionSetConfig>()
    for (const ps of iamConfig?.permissionSets ?? []) {
      map.set(ps.name, ps)
    }
    return map
  }, [iamConfig])

  const columns: TableProps<IdentityCenterAssignmentConfig>['columnDefinitions'] = useMemo(() => [
    {
      id: 'principal',
      header: 'SSO Group (Principal)',
      cell: item => item.principalId,
      sortingField: 'principal'
    },
    {
      id: 'role',
      header: 'Permission Set',
      cell: item => item.permissionSetName,
      sortingField: 'role'
    },
    {
      id: 'description',
      header: 'Description',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        return ps?.description ?? '-'
      }
    },
    {
      id: 'duration',
      header: 'Session Duration',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        return ps?.sessionDuration ?? '-'
      }
    },
    {
      id: 'policies',
      header: 'Policies',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        if (!ps) return '-'
        const aws = ps.awsManagedPolicies?.map(arn => arn.split('/').pop()) ?? []
        const cust = ps.customerManagedPolicies?.map(p => p.name) ?? []
        return [...aws, ...cust].join(', ') || 'None attached'
      }
    }
  ], [permissionSetsMap])

  const activeSortingColumn = columns.find(c => c.id === sortingColumn)

  const sortedAndFilteredAssignments = useMemo(() => {
    let result = matchingAssignments

    if (filteringText.trim()) {
      const query = filteringText.toLowerCase()
      result = result.filter(a =>
        a.principalId.toLowerCase().includes(query) ||
        a.permissionSetName.toLowerCase().includes(query)
      )
    }

    if (sortingColumn) {
      result = [...result].sort((a, b) => {
        let valA = ''
        let valB = ''
        if (sortingColumn === 'principal') {
          valA = a.principalId
          valB = b.principalId
        } else if (sortingColumn === 'role') {
          valA = a.permissionSetName
          valB = b.permissionSetName
        }
        const cmp = valA.localeCompare(valB)
        return sortingDescending ? -cmp : cmp
      })
    }

    return result
  }, [matchingAssignments, filteringText, sortingColumn, sortingDescending])

  const stacks: StackEntry[] = useMemo(() => {
    const dataStacks = node?.data?.stacks
    return Array.isArray(dataStacks) ? (dataStacks as StackEntry[]) : []
  }, [node])

  const stacksColumns: TableProps<StackEntry>['columnDefinitions'] = useMemo(() => [
    {
      id: 'name',
      header: 'Stack Name',
      cell: item => (
        <Box variant="span" fontWeight="bold">
          {item.name} {item.isStackSet && <Box variant="span" color="text-status-info" fontSize="body-s"> (StackSet)</Box>}
        </Box>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      cell: item => item.description || '-',
    },
    {
      id: 'regions',
      header: 'Regions',
      cell: item => item.regions?.join(', ') || '-',
    },
    {
      id: 'parameters',
      header: 'Parameters',
      cell: item => {
        if (!item.parameters || item.parameters.length === 0) return '-'
        return (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
            {item.parameters.map((p, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                <strong>{p.name}</strong>: {p.value}
              </li>
            ))}
          </ul>
        )
      }
    }
  ], [])

  const filteredStacks = useMemo(() => {
    if (!stacksFilteringText.trim()) return stacks
    const q = stacksFilteringText.toLowerCase()
    return stacks.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q)) ||
      (s.regions && s.regions.some(r => r.toLowerCase().includes(q))) ||
      (s.parameters && s.parameters.some(p => p.name.toLowerCase().includes(q) || p.value.toLowerCase().includes(q)))
    )
  }, [stacks, stacksFilteringText])

  if (!node) {
    return (
      <div style={{ color: '#aaa', fontSize: 12, fontFamily: 'sans-serif', padding: '8px 0' }}>
        Click on a node in the diagram to view details.
      </div>
    )
  }

  const color = KIND_COLOR[node.kind] ?? '#232F3E'

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <div
        style={{
          display: 'inline-block',
          background: color,
          color: '#fff',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 10,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {node.data.isAggregate
          ? 'CloudFormation Stacks (Aggregated)'
          : (KIND_LABEL[node.kind] ?? node.kind)}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#232F3E', marginBottom: 12 }}>
        {node.label}
      </div>
      {Object.entries(node.data)
        .filter(([k]) => !SKIP_KEYS.has(k))
        .map(([k, v]) => (
          <Row key={k} label={FIELD_LABEL[k] ?? k} value={v} />
        ))}
      {node.parentId && (
        <Row label="Parent" value={node.parentId.substring(node.parentId.indexOf(':') + 1)} />
      )}

      {isFirewall && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eaeded', paddingTop: 15 }}>
          <Header
            variant="h3"
            description={
              parsedFwRules.isSample
                ? "Showing default sample rules (no rules parsed from YAML)."
                : `Parsed ${parsedFwRules.rules.length} rules from configuration.`
            }
          >
            Firewall Rules
          </Header>
          <div style={{ height: 8 }} />
          <Button onClick={() => setFwModalOpen(true)}>View Firewall Rules</Button>
        </div>
      )}

      {matchingAssignments.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eaeded', paddingTop: 15 }}>
          <Header variant="h3">SSO Assignments</Header>
          <div style={{ height: 8 }} />
          <SpaceBetween size="s">
            <Box variant="p">
              There are <strong>{matchingAssignments.length}</strong> active SSO assignments for this object.
            </Box>
            <Button onClick={() => setModalOpen(true)}>Show SSO Assignments</Button>
          </SpaceBetween>
        </div>
      )}

      {!!node?.data?.isAggregate && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eaeded', paddingTop: 15 }}>
          <Header
            variant="h3"
            description={`Aggregated ${stacks.length} CloudFormation stacks deployed in this container.`}
          >
            CloudFormation Stacks
          </Header>
          <div style={{ height: 8 }} />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Stacks Summary
            </div>
            <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 150, overflowY: 'auto', fontSize: 12, color: '#232F3E' }}>
              {stacks.map((s, idx) => (
                <li key={idx} style={{ marginBottom: 2 }}>
                  <strong>{s.name}</strong> {s.isStackSet && <span style={{ color: '#0073bb', fontSize: 10 }}>(StackSet)</span>}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={() => setStacksModalOpen(true)}>View Stacks Details</Button>
        </div>
      )}

      <Modal
        onDismiss={() => setModalOpen(false)}
        visible={modalOpen}
        header={`SSO Assignments for ${node?.label}`}
        size="large"
        closeAriaLabel="Close modal"
      >
        <SpaceBetween size="m">
          <Input
            value={filteringText}
            onChange={({ detail }) => setFilteringText(detail.value)}
            placeholder="Search group or role..."
            clearAriaLabel="Clear search"
          />
          <Table
            columnDefinitions={columns}
            items={sortedAndFilteredAssignments}
            sortingColumn={activeSortingColumn}
            sortingDescending={sortingDescending}
            onSortingChange={({ detail }) => {
               setSortingColumn(detail.sortingColumn.sortingField as 'principal' | 'role' | null)
               setSortingDescending(detail.isDescending ?? false)
            }}
            empty={
              <Box textAlign="center" color="inherit">
                No SSO assignments found
              </Box>
            }
          />
        </SpaceBetween>
      </Modal>

      <Modal
        onDismiss={() => setFwModalOpen(false)}
        visible={fwModalOpen}
        header={`AWS Network Firewall Rules for ${node?.label}`}
        size="max"
        closeAriaLabel="Close modal"
      >
        <SpaceBetween size="m">
          {parsedFwRules.isSample && (
            <Box variant="p" color="text-status-info">
              💡 <strong>Note:</strong> These are sample rules displayed for demonstration. To define your own, configure <code>centralNetworkServices.networkFirewall.rules</code> in your <code>network-config.yaml</code>.
            </Box>
          )}
          <Input
            value={fwFilteringText}
            onChange={({ detail }) => setFwFilteringText(detail.value)}
            placeholder="Filter rules by group, action, protocol, IP..."
            clearAriaLabel="Clear search"
          />
          <Table
            columnDefinitions={fwColumns}
            items={filteredFwRules}
            empty={
              <Box textAlign="center" color="inherit">
                No matching firewall rules found
              </Box>
            }
          />
        </SpaceBetween>
      </Modal>

      <Modal
        onDismiss={() => setStacksModalOpen(false)}
        visible={stacksModalOpen}
        header={`CloudFormation Stacks Details for ${node?.label}`}
        size="large"
        closeAriaLabel="Close modal"
      >
        <SpaceBetween size="m">
          <Input
            value={stacksFilteringText}
            onChange={({ detail }) => setStacksFilteringText(detail.value)}
            placeholder="Search stacks by name, description, parameters..."
            clearAriaLabel="Clear search"
          />
          <Table
            columnDefinitions={stacksColumns}
            items={filteredStacks}
            empty={
              <Box textAlign="center" color="inherit">
                No matching CloudFormation stacks found
              </Box>
            }
          />
        </SpaceBetween>
      </Modal>
    </div>
  )
}
