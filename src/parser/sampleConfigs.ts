// Bundled at build time (Vite's `?raw` import) rather than fetched from
// `public/` — keeps "try a sample" working identically in the dev server,
// the static web build, and the packaged Electron app without needing the
// samples folder shipped or resolved as a runtime asset.
import organization from '../../samples/organization-config.yaml?raw'
import accounts from '../../samples/accounts-config.yaml?raw'
import network from '../../samples/network-config.yaml?raw'
import security from '../../samples/security-config.yaml?raw'
import iam from '../../samples/iam-config.yaml?raw'
import global_ from '../../samples/global-config.yaml?raw'
import customizations from '../../samples/customizations-config.yaml?raw'
import denyRootUser from '../../samples/service-control-policies/deny-root-user.json?raw'
import flawedOrganization from '../../samples/with-findings/organization-config.yaml?raw'
import flawedNetwork from '../../samples/with-findings/network-config.yaml?raw'
import flawedCustomizations from '../../samples/with-findings/customizations-config.yaml?raw'

export const SAMPLE_CONFIGS: Record<string, string> = {
  'organization-config.yaml': organization,
  'accounts-config.yaml': accounts,
  'network-config.yaml': network,
  'security-config.yaml': security,
  'iam-config.yaml': iam,
  'global-config.yaml': global_,
  'customizations-config.yaml': customizations,
  // Policy documents the configs point at. Without these an SCP shows as
  // attached with nothing behind it, which is not what a real config looks like.
  'service-control-policies/deny-root-user.json': denyRootUser,
}

/**
 * The same landing zone with a handful of deliberate mistakes, so the
 * Validation panel has something to show without anyone having to break a
 * config themselves.
 *
 * Only the three files that carry the mistakes are replaced; the rest is the
 * clean set, so the two loads are comparable. Every issue is one a real team
 * makes — a policy naming an OU that does not exist, a stack targeting a parent
 * OU expecting it to reach the nested ones, overlapping CIDRs across a shared
 * Transit Gateway, an attachment nothing can route to.
 */
export const SAMPLE_CONFIGS_WITH_FINDINGS: Record<string, string> = {
  ...SAMPLE_CONFIGS,
  'organization-config.yaml': flawedOrganization,
  'network-config.yaml': flawedNetwork,
  'customizations-config.yaml': flawedCustomizations,
}
