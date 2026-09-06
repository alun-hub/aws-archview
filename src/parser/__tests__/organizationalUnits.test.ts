import { describe, it, expect } from 'vitest'
import { flattenOus } from '../organizationalUnits'
import { parseOrganization } from '../organizationParser'
import type { AccountsConfig, OrganizationConfig } from '../types'

describe('flattenOus', () => {
  // This is how LZA writes it: a flat list, the path in the name, every level
  // declared. The nested form the samples used is not part of the schema.
  const flat: OrganizationConfig = {
    enable: true,
    organizationalUnits: [
      { name: 'Workloads' },
      { name: 'Workloads/Dev' },
      { name: 'Workloads/Prod' },
      { name: 'Suspended', ignore: true },
    ],
  }

  it('resolves parentage from the path', () => {
    // Sorted parents-first so a consumer can build nodes in one pass.
    expect(flattenOus(flat.organizationalUnits).map((o) => [o.path, o.label, o.parentPath])).toEqual([
      ['Suspended', 'Suspended', null],
      ['Workloads', 'Workloads', null],
      ['Workloads/Dev', 'Dev', 'Workloads'],
      ['Workloads/Prod', 'Prod', 'Workloads'],
    ])
  })

  it('reads the nested form too, so an older config still works', () => {
    const nested: OrganizationConfig = {
      enable: true,
      organizationalUnits: [{ name: 'Workloads', organizationalUnits: [{ name: 'Dev' }] }],
    }
    expect(flattenOus(nested.organizationalUnits).map((o) => o.path)).toEqual(['Workloads', 'Workloads/Dev'])
  })

  it('carries `ignore` down to nested OUs', () => {
    const nested: OrganizationConfig = {
      enable: true,
      organizationalUnits: [{ name: 'Suspended', ignore: true, organizationalUnits: [{ name: 'Old' }] }],
    }
    expect(flattenOus(nested.organizationalUnits).every((o) => o.ignore)).toBe(true)
  })

  it('invents a missing intermediate level rather than orphaning the child', () => {
    // LZA requires every level to be declared; a config that skips one should
    // still draw a connected tree.
    const gap: OrganizationConfig = { enable: true, organizationalUnits: [{ name: 'A/B/C' }] }
    expect(flattenOus(gap.organizationalUnits).map((o) => o.path).sort()).toEqual(['A', 'A/B', 'A/B/C'])
  })
})

describe('parseOrganization with flat OUs', () => {
  it('nests the graph from the paths, not from declaration order', () => {
    const accounts: AccountsConfig = {
      mandatoryAccounts: [{ name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' }],
      workloadAccounts: [{ name: 'Dev-A', email: 'd@example.com', organizationalUnit: 'Workloads/Dev' }],
    }
    const model = parseOrganization({
      enable: true,
      organizationalUnits: [{ name: 'Workloads' }, { name: 'Workloads/Dev' }],
    }, accounts)

    const dev = model.nodes.find((n) => n.id === 'ou:Workloads/Dev')!
    expect(dev.label).toBe('Dev')
    expect(dev.parentId).toBe('ou:Workloads')
    expect(model.nodes.find((n) => n.id === 'ou:Workloads')?.parentId).toBe('root')
    // The account lands under its own OU, not under Root.
    expect(model.nodes.find((n) => n.id === 'account:Dev-A')?.parentId).toBe('ou:Workloads/Dev')
  })
})
