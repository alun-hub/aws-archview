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
import type { PermissionSetConfig, IdentityCenterAssignmentConfig } from '../../parser/types'
import type { GraphNode } from '../../parser'

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
  service:        'AWS Service',
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
  iam:            '#CD2264',
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
}

// Keys to skip from raw data (shown separately or irrelevant)
const SKIP_KEYS = new Set(['kind'])

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
      header: 'SSO-grupp (Principal)',
      cell: item => item.principalId,
      sortingField: 'principal'
    },
    {
      id: 'role',
      header: 'Behörighet (Permission Set)',
      cell: item => item.permissionSetName,
      sortingField: 'role'
    },
    {
      id: 'description',
      header: 'Beskrivning',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        return ps?.description ?? '-'
      }
    },
    {
      id: 'duration',
      header: 'Sessionslängd',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        return ps?.sessionDuration ?? '-'
      }
    },
    {
      id: 'policies',
      header: 'Policys',
      cell: item => {
        const ps = permissionSetsMap.get(item.permissionSetName)
        if (!ps) return '-'
        const aws = ps.awsManagedPolicies?.map(arn => arn.split('/').pop()) ?? []
        const cust = ps.customerManagedPolicies?.map(p => p.name) ?? []
        return [...aws, ...cust].join(', ') || 'Inga bifogade'
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

  if (!node) {
    return (
      <div style={{ color: '#aaa', fontSize: 12, fontFamily: 'sans-serif', padding: '8px 0' }}>
        Klicka på en nod i diagrammet för att se detaljer.
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
        {KIND_LABEL[node.kind] ?? node.kind}
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

      {matchingAssignments.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid #eaeded', paddingTop: 15 }}>
          <Header variant="h3">SSO-tilldelningar</Header>
          <div style={{ height: 8 }} />
          <SpaceBetween size="s">
            <Box variant="p">
              Det finns <strong>{matchingAssignments.length}</strong> aktiva SSO-rolltilldelningar för detta objekt.
            </Box>
            <Button onClick={() => setModalOpen(true)}>Visa SSO-tilldelningar</Button>
          </SpaceBetween>
        </div>
      )}

      <Modal
        onDismiss={() => setModalOpen(false)}
        visible={modalOpen}
        header={`SSO-tilldelningar för ${node?.label}`}
        size="large"
        closeAriaLabel="Stäng modal"
      >
        <SpaceBetween size="m">
          <Input
            value={filteringText}
            onChange={({ detail }) => setFilteringText(detail.value)}
            placeholder="Sök grupp eller roll..."
            clearAriaLabel="Rensa sökning"
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
                Inga SSO-tilldelningar hittades
              </Box>
            }
          />
        </SpaceBetween>
      </Modal>
    </div>
  )
}
