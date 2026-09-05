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

export const SAMPLE_CONFIGS: Record<string, string> = {
  'organization-config.yaml': organization,
  'accounts-config.yaml': accounts,
  'network-config.yaml': network,
  'security-config.yaml': security,
  'iam-config.yaml': iam,
  'global-config.yaml': global_,
  'customizations-config.yaml': customizations,
}
