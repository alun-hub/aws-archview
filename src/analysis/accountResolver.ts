// ─── Org tree + deployment target resolution ─────────────────────────────────
//
// Every LZA config file targets accounts the same way — a `deploymentTargets`
// (or `shareTargets`) block naming OUs and/or accounts — but each parser used
// to answer "which accounts does that mean?" on its own. This module is the one
// answer, so validation, the diagram, and the policy matrix cannot disagree
// about who a policy applies to.

import type {
  AccountsConfig,
  DeploymentTargets,
  OUConfig,
  OrganizationConfig,
} from '../parser/types'

/** AWS Organizations (and LZA) always name the top-level OU "Root"; it is
 *  implicit rather than declared in `organizationalUnits`, and targeting it
 *  means every account. */
export const ROOT_OU = 'Root'

export interface ResolvedAccount {
  name: string
  email: string
  /** Full OU path from accounts-config, or `ROOT_OU` when unset. */
  ouPath: string
  source: 'mandatory' | 'workload'
}

export interface TargetExpansion {
  /** Account names the target resolves to, sorted, duplicates removed. */
  accounts: string[]
  /** Referenced OU paths that no OU in organization-config declares. */
  unknownOus: string[]
  /** Referenced account names that no account in accounts-config declares. */
  unknownAccounts: string[]
}

/** Deployment targets in customizations-config also carry exclusions. */
export interface ExpandableTargets extends DeploymentTargets {
  excludedAccounts?: string[]
}

export interface AccountIndex {
  accounts: ResolvedAccount[]
  byName: Map<string, ResolvedAccount>
  /** Every declared OU path, deepest paths included ("Infrastructure/Network"). */
  ouPaths: string[]
  /** Declared OUs carrying `ignore: true` — they exist in the config but LZA
   *  does not manage them, so targeting one is not a broken reference. */
  ignoredOuPaths: Set<string>
  hasOu(path: string): boolean
  /** Accounts directly in `path` plus those in OUs nested beneath it, matching
   *  how LZA expands an OU deployment target. `ROOT_OU` returns everything. */
  accountsInOu(path: string): ResolvedAccount[]
  expand(targets?: ExpandableTargets): TargetExpansion
}

function walkOus(
  ous: OUConfig[],
  parentPath: string,
  paths: string[],
  ignored: Set<string>,
  inheritedIgnore: boolean,
) {
  for (const ou of ous) {
    if (!ou?.name) continue
    const path = parentPath ? `${parentPath}/${ou.name}` : ou.name
    const isIgnored = inheritedIgnore || ou.ignore === true
    paths.push(path)
    if (isIgnored) ignored.add(path)
    walkOus(ou.organizationalUnits ?? [], path, paths, ignored, isIgnored)
  }
}

export function buildAccountIndex(
  organization?: OrganizationConfig,
  accountsConfig?: AccountsConfig,
): AccountIndex {
  const ouPaths: string[] = []
  const ignoredOuPaths = new Set<string>()
  walkOus(organization?.organizationalUnits ?? [], '', ouPaths, ignoredOuPaths, false)

  const accounts: ResolvedAccount[] = [
    ...(accountsConfig?.mandatoryAccounts ?? []).map((a) => ({ ...a, source: 'mandatory' as const })),
    ...(accountsConfig?.workloadAccounts ?? []).map((a) => ({ ...a, source: 'workload' as const })),
  ]
    .filter((a) => a?.name)
    .map((a) => ({
      name: a.name,
      email: a.email,
      ouPath: a.organizationalUnit || ROOT_OU,
      source: a.source,
    }))

  const byName = new Map(accounts.map((a) => [a.name, a]))
  const ouPathSet = new Set(ouPaths)

  const hasOu = (path: string) => path === ROOT_OU || ouPathSet.has(path)

  const accountsInOu = (path: string) => {
    if (path === ROOT_OU) return accounts
    const prefix = `${path}/`
    return accounts.filter((a) => a.ouPath === path || a.ouPath.startsWith(prefix))
  }

  const expand = (targets?: ExpandableTargets): TargetExpansion => {
    const resolved = new Set<string>()
    const unknownOus: string[] = []
    const unknownAccounts: string[] = []

    for (const ou of targets?.organizationalUnits ?? []) {
      if (!hasOu(ou)) {
        unknownOus.push(ou)
        continue
      }
      for (const a of accountsInOu(ou)) resolved.add(a.name)
    }
    for (const name of targets?.accounts ?? []) {
      if (!byName.has(name)) {
        unknownAccounts.push(name)
        continue
      }
      resolved.add(name)
    }
    for (const name of targets?.excludedAccounts ?? []) resolved.delete(name)

    return {
      accounts: [...resolved].sort(),
      unknownOus,
      unknownAccounts,
    }
  }

  return { accounts, byName, ouPaths, ignoredOuPaths, hasOu, accountsInOu, expand }
}
