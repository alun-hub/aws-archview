import yaml from 'js-yaml'
import type { AccountsConfig, NetworkConfig, OrganizationConfig, SecurityConfig, IamConfig, GlobalConfig, CustomizationsConfig } from './types'
import { parseNetwork } from './networkParser'
import { parseOrganization } from './organizationParser'
import { parseGlobal } from './globalParser'
import { parseCustomizations } from './customizationsParser'
import { parseSecurity } from './securityParser'
import { parseIam } from './iamParser'

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

export type ViewKind = 'organization' | 'network' | 'global' | 'customizations' | 'security' | 'iam'

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

export function findIncludes(content: string): string[] {
  return [...content.matchAll(/!include\s+(\S+)/g)].map((m) => m[1])
}

// ── Replacements: {{KEY}} → value from replacements-config.yaml ───────────────

function buildReplacementsMap(loadedFiles: Record<string, string>): Map<string, string> {
  const raw = loadedFiles['replacements-config.yaml']
  if (!raw) return new Map()
  try {
    const config = yaml.load(raw, { schema: yaml.DEFAULT_SCHEMA }) as {
      globalReplacements?: Array<{ key: string; type?: string; value?: string | string[] }>
    }
    const map = new Map<string, string>()
    for (const r of config?.globalReplacements ?? []) {
      if (!r.key || r.value == null) continue
      // SSM path-based replacements are skipped in the browser
      map.set(r.key, Array.isArray(r.value) ? r.value.join(', ') : String(r.value))
    }
    return map
  } catch {
    return new Map()
  }
}

function resolveReplacements(content: string, replacementsMap: Map<string, string>): string {
  if (replacementsMap.size === 0) return content
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => replacementsMap.get(key) ?? `{{${key}}}`)
}

// ── Includes: !include path/to/file.yaml ─────────────────────────────────────

function findFile(path: string, loadedFiles: Record<string, string>): string | undefined {
  if (loadedFiles[path] != null) return loadedFiles[path]
  const basename = path.split('/').pop()!
  for (const [k, v] of Object.entries(loadedFiles)) {
    if (k === basename || k.split('/').pop() === basename) return v
  }
  return undefined
}

function buildIncludeSchema(
  loadedFiles: Record<string, string>,
  replacementsMap: Map<string, string>,
): yaml.Schema {
  // schema is referenced by the construct closure — assigned after Type creation
  let schema: yaml.Schema
  const includeType = new yaml.Type('!include', {
    kind: 'scalar',
    resolve: (data) => typeof data === 'string',
    construct: (data: string) => {
      const content = findFile(data, loadedFiles)
      if (content == null) return null
      return yaml.load(resolveReplacements(content, replacementsMap), { schema })
    },
  })
  schema = yaml.DEFAULT_SCHEMA.extend([includeType])
  return schema
}

// ── Public parse API ──────────────────────────────────────────────────────────

export function parseYaml<T>(content: string, loadedFiles: Record<string, string> = {}): T {
  const replacementsMap = buildReplacementsMap(loadedFiles)
  const resolved = resolveReplacements(content, replacementsMap)
  const schema = buildIncludeSchema(loadedFiles, replacementsMap)
  return yaml.load(resolved, { schema }) as T
}

export function parsedForKey(key: keyof LzaConfigs, content: string, loadedFiles: Record<string, string> = {}): Partial<LzaConfigs> {
  switch (key) {
    case 'organization':    return { organization:    parseYaml<OrganizationConfig>(content, loadedFiles) }
    case 'accounts':        return { accounts:        parseYaml<AccountsConfig>(content, loadedFiles) }
    case 'network':         return { network:         parseYaml<NetworkConfig>(content, loadedFiles) }
    case 'security':        return { security:        parseYaml<SecurityConfig>(content, loadedFiles) }
    case 'iam':             return { iam:             parseYaml<IamConfig>(content, loadedFiles) }
    case 'global':          return { global:          parseYaml<GlobalConfig>(content, loadedFiles) }
    case 'customizations':  return { customizations:  parseYaml<CustomizationsConfig>(content, loadedFiles) }
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

export function buildCustomizationsGraph(configs: LzaConfigs, aggregateStacks: boolean = true) {
  if (!configs.customizations) return null
  return parseCustomizations(configs.customizations, aggregateStacks)
}

export function buildSecurityGraph(configs: LzaConfigs) {
  if (!configs.security) return null
  return parseSecurity(configs.security)
}

export function buildIamGraph(configs: LzaConfigs) {
  if (!configs.iam) return null
  return parseIam(configs.iam, configs.accounts)
}
