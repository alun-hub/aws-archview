import type { AccountIndex } from './accountResolver'
import type { NetworkConfig, VpcConfig } from './types'

/** A VPC as it will actually be deployed, whether declared outright or built
 *  from a template. */
export interface ResolvedVpc {
  vpc: VpcConfig
  /** Set when this VPC came from a `vpcTemplates` entry. */
  templateName?: string
  /** Why the target holds no accounts, when it doesn't. The `account` field
   *  then carries the deployment target itself rather than an account name. */
  unresolvedTarget?: 'no-account-config' | 'no-matching-accounts'
}

/**
 * Every VPC in a network config: the `vpcs` list plus one entry per account a
 * `vpcTemplates` entry deploys into.
 *
 * LZA builds a real VPC in each target account, so a template that targets an
 * OU with three accounts is three VPCs — the diagram and the rules should both
 * see them. Reading only `vpcs` is why the Universal Configuration's dev, test
 * and prod VPCs were missing from the diagram entirely.
 *
 * Without an account index the targets cannot be expanded. Rather than drop the
 * templates — the bug this function exists to fix — each is emitted once with
 * its deployment target standing in for the account, so it is visible and
 * honestly labelled.
 */
export function resolveVpcs(
  network: NetworkConfig | undefined,
  accounts?: AccountIndex,
): ResolvedVpc[] {
  const out: ResolvedVpc[] = (network?.vpcs ?? []).map((vpc) => ({ vpc }))

  for (const template of network?.vpcTemplates ?? []) {
    const { deploymentTargets, ...rest } = template
    const targetAccounts = accounts?.expand(deploymentTargets).accounts ?? []

    if (targetAccounts.length > 0) {
      for (const account of targetAccounts) {
        out.push({ vpc: { ...rest, account }, templateName: template.name })
      }
      continue
    }

    const label = [
      ...(deploymentTargets?.organizationalUnits ?? []),
      ...(deploymentTargets?.accounts ?? []),
    ].join(', ')
    out.push({
      vpc: { ...rest, account: label || 'Unassigned' },
      templateName: template.name,
      // Two different situations, and telling someone to load a file they have
      // already loaded is worse than saying nothing.
      unresolvedTarget: accounts ? 'no-matching-accounts' : 'no-account-config',
    })
  }

  return out
}

/** Just the VPCs, for the many callers that do not care where they came from. */
export function allVpcs(network: NetworkConfig | undefined, accounts?: AccountIndex): VpcConfig[] {
  return resolveVpcs(network, accounts).map((r) => r.vpc)
}
