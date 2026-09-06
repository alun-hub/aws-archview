import { describe, it, expect } from 'vitest'
import type { AccountsConfig, OrganizationConfig } from '../../parser/types'
import { buildAccountIndex } from '../../parser/accountResolver'

const organization: OrganizationConfig = {
  enable: true,
  organizationalUnits: [
    { name: 'Security' },
    {
      name: 'Infrastructure',
      organizationalUnits: [{ name: 'Network' }],
    },
    { name: 'Suspended', ignore: true },
  ],
}

const accounts: AccountsConfig = {
  mandatoryAccounts: [
    { name: 'Management', email: 'm@example.com', organizationalUnit: 'Root' },
    { name: 'LogArchive', email: 'l@example.com', organizationalUnit: 'Security' },
  ],
  workloadAccounts: [
    { name: 'Network', email: 'n@example.com', organizationalUnit: 'Infrastructure/Network' },
    { name: 'Shared', email: 's@example.com', organizationalUnit: 'Infrastructure' },
  ],
}

describe('buildAccountIndex', () => {
  it('reads OUs declared flat, with the path in the name, as LZA does', () => {
    const flat = buildAccountIndex({
      enable: true,
      organizationalUnits: [
        { name: 'Workloads' },
        { name: 'Workloads/Dev' },
        { name: 'Workloads/Dev/Team-A' },
      ],
    }, { mandatoryAccounts: [{ name: 'A', email: 'a@example.com', organizationalUnit: 'Workloads/Dev/Team-A' }] })
    expect([...flat.ouPaths].sort()).toEqual(['Workloads', 'Workloads/Dev', 'Workloads/Dev/Team-A'])
    expect(flat.accountsInOu('Workloads/Dev').map((a) => a.name)).toEqual(['A'])
  })

  it('flattens nested OUs to full paths', () => {
    const index = buildAccountIndex(organization, accounts)
    // Order is parents-before-children, then alphabetical; the set is what
    // matters here.
    expect([...index.ouPaths].sort())
      .toEqual(['Infrastructure', 'Infrastructure/Network', 'Security', 'Suspended'])
    expect(index.hasOu('Infrastructure/Network')).toBe(true)
    expect(index.hasOu('Network')).toBe(false)
    expect(index.hasOu('Root')).toBe(true)
  })

  it('records ignored OUs as existing, so targeting one is not a broken reference', () => {
    const index = buildAccountIndex(organization, accounts)
    expect(index.hasOu('Suspended')).toBe(true)
    expect(index.ignoredOuPaths.has('Suspended')).toBe(true)
  })

  it('defaults an account with no OU to Root', () => {
    const index = buildAccountIndex(organization, { mandatoryAccounts: [
      { name: 'Odd', email: 'o@example.com', organizationalUnit: '' },
    ] })
    expect(index.byName.get('Odd')!.ouPath).toBe('Root')
  })
})

describe('accountsInOu', () => {
  it('includes accounts in nested OUs, matching how LZA expands an OU target', () => {
    const index = buildAccountIndex(organization, accounts)
    expect(index.accountsInOu('Infrastructure').map((a) => a.name).sort()).toEqual(['Network', 'Shared'])
    expect(index.accountsInOu('Infrastructure/Network').map((a) => a.name)).toEqual(['Network'])
  })

  it('treats Root as every account', () => {
    const index = buildAccountIndex(organization, accounts)
    expect(index.accountsInOu('Root')).toHaveLength(4)
  })

  it('does not match an OU whose path is a string prefix of another', () => {
    const index = buildAccountIndex(
      { enable: true, organizationalUnits: [{ name: 'Prod' }, { name: 'Production' }] },
      { mandatoryAccounts: [{ name: 'A', email: 'a@example.com', organizationalUnit: 'Production' }] },
    )
    expect(index.accountsInOu('Prod')).toHaveLength(0)
  })
})

describe('expandPolicy', () => {
  const index = buildAccountIndex(organization, accounts)

  it('resolves OUs and accounts together, deduplicated and sorted', () => {
    expect(index.expandPolicy({ organizationalUnits: ['Infrastructure'], accounts: ['Network', 'LogArchive'] }).accounts)
      .toEqual(['LogArchive', 'Network', 'Shared'])
  })

  it('reports references that do not exist instead of silently dropping them', () => {
    const result = index.expandPolicy({ organizationalUnits: ['Infrastucture'], accounts: ['Netwrok'] })
    expect(result.unknownOus).toEqual(['Infrastucture'])
    expect(result.unknownAccounts).toEqual(['Netwrok'])
    expect(result.accounts).toEqual([])
  })

  it('applies excludedAccounts', () => {
    expect(index.expandPolicy({ organizationalUnits: ['Root'], excludedAccounts: ['Management', 'Shared'] }).accounts)
      .toEqual(['LogArchive', 'Network'])
  })

  it('treats an absent target block as deploying nowhere', () => {
    expect(index.expandPolicy(undefined).accounts).toEqual([])
    expect(index.expandPolicy({}).accounts).toEqual([])
  })
})

describe('expandDeployment', () => {
  const index = buildAccountIndex(organization, accounts)

  it('matches an OU exactly, as LZA resolves a deploymentTargets block', () => {
    // `getAccountIdsFromDeploymentTarget` compares `ou === account.organizationalUnit`.
    // Targeting a parent reaches nothing when the accounts sit below it — the
    // trap that makes this different from a policy attachment.
    expect(index.expandDeployment({ organizationalUnits: ['Infrastructure'] }).accounts)
      .toEqual(['Shared'])
    expect(index.expandPolicy({ organizationalUnits: ['Infrastructure'] }).accounts.sort())
      .toEqual(['Network', 'Shared'])
  })

  it('still treats Root as every account', () => {
    expect(index.expandDeployment({ organizationalUnits: ['Root'] }).accounts)
      .toEqual(index.accounts.map((a) => a.name).sort())
  })

  it('applies excludedAccounts and reports unknown references the same way', () => {
    const result = index.expandDeployment({ organizationalUnits: ['Root', 'Nope'], excludedAccounts: ['Management'] })
    expect(result.accounts).not.toContain('Management')
    expect(result.unknownOus).toEqual(['Nope'])
  })
})
