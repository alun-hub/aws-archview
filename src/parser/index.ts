import yaml from 'js-yaml'
import type { AccountsConfig, NetworkConfig, OrganizationConfig, SecurityConfig, IamConfig, GlobalConfig, CustomizationsConfig } from './types'
import { parseNetwork } from './networkParser'
import { parseOrganization } from './organizationParser'
import { parseGlobal } from './globalParser'
import { parseCustomizations } from './customizationsParser'

export type { GraphEdge, GraphModel, GraphNode } from './types'
export type { GlobalConfig, CustomizationsConfig } from './types'

export interface LzaConfigs {
  organization?: OrganizationConfig
  accounts?: AccountsConfig
  network?: NetworkConfig
  security?: SecurityConfig
  iam?: IamConfig
  global?: GlobalConfig
  customizations?: CustomizationsConfig
}

export type ViewKind = 'organization' | 'network' | 'global' | 'customizations'

export const FILE_MAP: Record<string, keyof LzaConfigs> = {
  'organization-config.yaml':  'organization',
  'accounts-config.yaml':      'accounts',
  'network-config.yaml':       'network',
  'security-config.yaml':      'security',
  'iam-config.yaml':           'iam',
  'global-config.yaml':        'global',
  'customizations-config.yaml':'customizations',
}

export function resolveConfigKey(filename: string): keyof LzaConfigs | null {
  const base = filename.toLowerCase().replace(/.*[\\/]/, '')
  return FILE_MAP[base] ?? null
}

export function parseYaml<T>(content: string): T {
  return yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as T
}

export function parsedForKey(key: keyof LzaConfigs, content: string): Partial<LzaConfigs> {
  switch (key) {
    case 'organization':    return { organization:    parseYaml<OrganizationConfig>(content) }
    case 'accounts':        return { accounts:        parseYaml<AccountsConfig>(content) }
    case 'network':         return { network:         parseYaml<NetworkConfig>(content) }
    case 'security':        return { security:        parseYaml<SecurityConfig>(content) }
    case 'iam':             return { iam:             parseYaml<IamConfig>(content) }
    case 'global':          return { global:          parseYaml<GlobalConfig>(content) }
    case 'customizations':  return { customizations:  parseYaml<CustomizationsConfig>(content) }
  }
}

export function buildOrganizationGraph(configs: LzaConfigs) {
  if (!configs.organization || !configs.accounts) return null
  return parseOrganization(configs.organization, configs.accounts, configs.security, configs.iam)
}

export function buildNetworkGraph(configs: LzaConfigs) {
  if (!configs.network) return null
  return parseNetwork(configs.network)
}

export function buildGlobalGraph(configs: LzaConfigs) {
  if (!configs.global) return null
  return parseGlobal(configs.global)
}

export function buildCustomizationsGraph(configs: LzaConfigs) {
  if (!configs.customizations) return null
  return parseCustomizations(configs.customizations)
}
