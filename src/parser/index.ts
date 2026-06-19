import yaml from 'js-yaml'
import type { AccountsConfig, NetworkConfig, OrganizationConfig, SecurityConfig, IamConfig } from './types'
import { parseNetwork } from './networkParser'
import { parseOrganization } from './organizationParser'

export type { GraphEdge, GraphModel, GraphNode } from './types'

export interface LzaConfigs {
  organization?: OrganizationConfig
  accounts?: AccountsConfig
  network?: NetworkConfig
  security?: SecurityConfig
  iam?: IamConfig
}

export type ViewKind = 'organization' | 'network'

export function parseYaml<T>(content: string): T {
  // DEFAULT_SCHEMA (js-yaml v4) disallows JS-specific type tags (!!js/undefined etc.)
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
