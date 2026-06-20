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

export function parseYaml<T>(content: string): T {
  return yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as T
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
