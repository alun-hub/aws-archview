import { describe, it, expect } from 'vitest'
import { buildAccountIndex } from '../accountResolver'
import { parseNetwork } from '../networkParser'
import type { AccountsConfig, NetworkConfig, OrganizationConfig } from '../types'
import { resolveVpcs } from '../vpcTemplates'

const organization: OrganizationConfig = {
  enable: true,
  organizationalUnits: [{ name: 'Workloads', organizationalUnits: [{ name: 'Dev' }] }],
}
const accounts: AccountsConfig = {
  mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
  workloadAccounts: [
    { name: 'Dev-A', email: 'a@example.com', organizationalUnit: 'Workloads/Dev' },
    { name: 'Dev-B', email: 'b@example.com', organizationalUnit: 'Workloads/Dev' },
  ],
}

const network: NetworkConfig = {
  vpcFlowLogs: { trafficType: 'ALL' },
  vpcs: [{ name: 'Hub-VPC', account: 'Network', region: 'eu-west-1', cidrs: ['10.0.0.0/16'] }],
  vpcTemplates: [{
    name: 'Workload-VPC',
    region: 'eu-west-1',
    deploymentTargets: { organizationalUnits: ['Workloads/Dev'] },
    subnets: [{ name: 'App-A', availabilityZone: 'a', routeTable: 'RT', ipv4CidrBlock: '10.9.0.0/24' }],
  }],
}

describe('resolveVpcs', () => {
  it('builds one VPC per account the template deploys into', () => {
    const index = buildAccountIndex(organization, accounts)
    const resolved = resolveVpcs(network, index)

    expect(resolved.map((r) => `${r.vpc.name}@${r.vpc.account}`)).toEqual([
      'Hub-VPC@Network',
      'Workload-VPC@Dev-A',
      'Workload-VPC@Dev-B',
    ])
    expect(resolved[1].templateName).toBe('Workload-VPC')
    expect(resolved[1].unresolvedTarget).toBeUndefined()
    // The template's own contents come along, not just its name.
    expect(resolved[1].vpc.subnets).toHaveLength(1)
    // `deploymentTargets` is a template concern and must not leak onto the VPC.
    expect('deploymentTargets' in resolved[1].vpc).toBe(false)
  })

  it('keeps a template visible when its target cannot be resolved', () => {
    // Dropping it would be the bug this exists to fix: the whole workload tier
    // would silently vanish from the diagram.
    const resolved = resolveVpcs(network)
    const template = resolved.find((r) => r.templateName)!
    expect(template.vpc.account).toBe('Workloads/Dev')
    expect(template.unresolvedTarget).toBe('no-account-config')
  })

  it('distinguishes an empty target from a missing accounts config', () => {
    // Telling someone to load a file they have already loaded is worse than
    // saying nothing.
    const emptyOu = buildAccountIndex(organization, { mandatoryAccounts: [] })
    const resolved = resolveVpcs(network, emptyOu)
    expect(resolved.find((r) => r.templateName)?.unresolvedTarget).toBe('no-matching-accounts')
  })

  it('leaves a config with no templates untouched', () => {
    expect(resolveVpcs({ vpcs: network.vpcs })).toEqual([{ vpc: network.vpcs![0] }])
  })
})

describe('parseNetwork with templates', () => {
  it('renders a node per target account, tagged with its template', () => {
    const index = buildAccountIndex(organization, accounts)
    const model = parseNetwork(network, undefined, index)

    const ids = model.nodes.filter((n) => n.kind === 'vpc').map((n) => n.id)
    expect(ids).toEqual([
      'vpc:Hub-VPC:Network',
      'vpc:Workload-VPC:Dev-A',
      'vpc:Workload-VPC:Dev-B',
    ])
    expect(model.nodes.find((n) => n.id === 'vpc:Workload-VPC:Dev-A')?.data.fromVpcTemplate)
      .toBe('Workload-VPC')
    // Each copy is placed under its own account, so the tree still reads.
    expect(model.nodes.some((n) => n.id === 'account:Dev-A')).toBe(true)
    expect(model.nodes.some((n) => n.id === 'account:Dev-B')).toBe(true)
  })

  it('renders the template once, labelled by its target, with no account index', () => {
    const model = parseNetwork(network)
    const node = model.nodes.find((n) => n.id === 'vpc:Workload-VPC:Workloads/Dev')
    expect(node).toBeDefined()
    expect(node?.data.templateTargetNote).toContain('Load accounts-config.yaml')
  })

  it('explains an empty target without telling you to load a loaded file', () => {
    const emptyOu = buildAccountIndex(organization, { mandatoryAccounts: [] })
    const model = parseNetwork(network, undefined, emptyOu)
    const node = model.nodes.find((n) => n.id === 'vpc:Workload-VPC:Workloads/Dev')
    expect(node?.data.templateTargetNote).toContain('No accounts are in this target yet')
  })

  it('carries the template subnets onto every copy', () => {
    const index = buildAccountIndex(organization, accounts)
    const model = parseNetwork(network, undefined, index)
    expect(model.nodes.filter((n) => n.label === 'App-A')).toHaveLength(2)
  })
})
