import * as yaml from 'js-yaml'
import type { AccountsConfig, NetworkConfig, OrganizationConfig, SecurityConfig, IamConfig, GlobalConfig, CustomizationsConfig } from './types'
import { parseNetwork } from './networkParser'
import { parseOrganization } from './organizationParser'
import { parseGlobal } from './globalParser'
import { parseCustomizations } from './customizationsParser'
import { parseSecurity } from './securityParser'
import { parseIam } from './iamParser'
import { buildPolicyMatrix as buildPolicyMatrixImpl } from './policyMatrix'

export type { GraphEdge, GraphModel, GraphNode } from './types'
export type { GlobalConfig, CustomizationsConfig } from './types'
export type { PolicyMatrix, PolicyMatrixRow, PolicyColumn, PolicyColumnType, PolicyMatrixCellState } from './policyMatrix'

export interface LzaConfigs {
  organization?: OrganizationConfig
  accounts?: AccountsConfig
  network?: NetworkConfig
  security?: SecurityConfig
  iam?: IamConfig
  global?: GlobalConfig
  customizations?: CustomizationsConfig
}

export type ViewKind = 'organization' | 'network' | 'global' | 'customizations' | 'security' | 'iam' | 'policies' | 'accounts'

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

export function findIncludes(content: string, loadedFiles: Record<string, string> = {}): string[] {
  // Resolve {{ KEY }} placeholders first so the extracted path matches what
  // the real parser (parseYaml) would actually look up — otherwise every
  // !include that embeds a replacement token reads as permanently "missing"
  // even when replacements-config.yaml resolves it to a loaded file.
  const resolved = resolveReplacements(content, buildReplacementsMap(loadedFiles))
  // Paths may be double- or single-quoted (common when they embed a
  // "{{ REPLACEMENT_KEY }}" token with internal spaces) or bare/unquoted.
  const re = /!include\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g
  return [...resolved.matchAll(re)].map((m) => m[1] ?? m[2] ?? m[3])
}

// ── Replacements: {{KEY}} → value from replacements-config.yaml ───────────────

// js-yaml v5 removed DEFAULT_SCHEMA and defaults `load()` to the YAML 1.2
// CORE_SCHEMA, which drops merge keys (`<<`). LZA configs use them, so add
// mergeTag back. CORE_SCHEMA (not YAML11_SCHEMA) keeps v4's scalar parsing:
// under YAML 1.1, `yes`/`no`/`on`/`off` become booleans and `0755` is octal,
// which would silently change values read out of existing configs.
const BASE_SCHEMA = yaml.CORE_SCHEMA.withTags(yaml.mergeTag)

function buildReplacementsMap(loadedFiles: Record<string, string>): Map<string, string> {
  // Dropping a config folder prefixes every key ("my-lza/replacements-config.yaml"),
  // so match by basename like findFile does — an exact-key miss here silently
  // collapses every {{ TOKEN }} to its literal name, which then makes every
  // templated !include path read as a missing file.
  const raw =
    findFile('replacements-config.yaml', loadedFiles) ??
    findFile('replacements-config.yml', loadedFiles)
  if (!raw) return new Map()
  try {
    const config = yaml.load(raw, { schema: BASE_SCHEMA, json: true }) as {
      globalReplacements?: Array<{ key?: string; type?: string; value?: string | string[] }>
    }
    const map = new Map<string, string>()
    for (const r of config?.globalReplacements ?? []) {
      if (!r?.key || r.value == null) continue
      // SSM path-based replacements (no literal value) can't resolve in the browser
      map.set(r.key, Array.isArray(r.value) ? r.value.join(', ') : String(r.value))
    }
    return map
  } catch {
    return new Map()
  }
}

// Replacement tokens used inside !include paths that don't resolve to anything —
// the reason a templated path degrades to a literal "missing" file name such as
// "Classification-Stage-RegionName-CVpn.yaml". Colon-bearing keys are LZA
// lookups (resolve:ssm:…, accel-lookup:…) that never resolve client-side, so
// they're excluded as noise.
export function findUnresolvedReplacements(loadedFiles: Record<string, string> = {}): string[] {
  const map = buildReplacementsMap(loadedFiles)
  // Grab the rest of each !include line (tokens like "{{ Stage }}" contain
  // spaces, so a \S+ path capture would stop at the first one).
  const includeLineRe = /!include[ \t]+(.+)/g
  const tokenRe = /\{\{\s*([^{}]+?)\s*\}\}/g
  const unresolved = new Set<string>()
  for (const content of Object.values(loadedFiles)) {
    for (const inc of content.matchAll(includeLineRe)) {
      for (const tok of inc[1].matchAll(tokenRe)) {
        const key = tok[1].trim()
        if (!key.includes(':') && !map.has(key)) unresolved.add(key)
      }
    }
  }
  return [...unresolved].sort()
}

function resolveReplacements(content: string, replacementsMap: Map<string, string>): string {
  // Match {{ KEY }} with optional spaces; keys may contain dashes, dots, colons
  // (e.g. LZA lookups like "accel-lookup::..."). Unresolved placeholders are
  // neutralized to a plain scalar so the YAML stays parseable.
  return content.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim()
    const value = replacementsMap.get(key)
    if (value != null) return value
    // Collapse whitespace so the token can't contain ": " or "# " sequences
    // that would break an unquoted YAML scalar.
    return key.replace(/\s+/g, '_')
  })
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
  // eslint-disable-next-line prefer-const
  let schema: yaml.Schema
  // v5 replaced the Type class with the tags API: a scalar tag's `resolve`
  // returns the value itself (v4 split that across resolve + construct), and
  // `identify` is mandatory — false here because this tag is load-only.
  const includeTag = yaml.defineScalarTag('!include', {
    resolve: (source: string) => {
      const content = findFile(source, loadedFiles)
      if (content == null) return null
      return loadTolerant(resolveReplacements(content, replacementsMap), schema)
    },
    identify: () => false,
  })
  schema = BASE_SCHEMA.withTags(includeTag)
  return schema
}

// Tolerant load: accepts duplicate keys (json: true) and multi-document files
// (documents are shallow-merged; a single document is returned as-is).
function loadTolerant(content: string, schema: yaml.Schema): unknown {
  const docs = yaml.loadAll(content, { schema, json: true }).filter((d) => d != null)
  if (docs.length === 0) return null
  if (docs.length === 1) return docs[0]
  return docs.reduce((acc: Record<string, unknown>, d) => {
    if (d && typeof d === 'object' && !Array.isArray(d)) Object.assign(acc, d)
    return acc
  }, {})
}

// An !include that points at a file the user didn't load resolves to null
// (see buildIncludeSchema). When that !include sits in a YAML sequence —
// `vpcs:`, `transitGateways:`, `customerGateways:`, … — the null becomes an
// array element, and every parser that iterates the sequence (`for (const vpc
// of networkConfig.vpcs ?? [])`) then throws on the first missing entry. Strip
// nullish holes from every array in the parsed tree so one absent include
// degrades gracefully (the "Missing included files" panel already reports it)
// instead of taking down the whole view. Object properties are left as-is —
// parsers guard those with optional chaining.
function compactIncludeHoles(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((v) => v != null).map(compactIncludeHoles)
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      obj[key] = compactIncludeHoles(obj[key])
    }
    return obj
  }
  return value
}

// ── Public parse API ──────────────────────────────────────────────────────────

export function parseYaml<T>(content: string, loadedFiles: Record<string, string> = {}): T {
  const replacementsMap = buildReplacementsMap(loadedFiles)
  const resolved = resolveReplacements(content, replacementsMap)
  const schema = buildIncludeSchema(loadedFiles, replacementsMap)
  return compactIncludeHoles(loadTolerant(resolved, schema)) as T
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

export function buildOrganizationGraph(configs: LzaConfigs, loadedFiles?: Record<string, string>) {
  if (!configs.organization || !configs.accounts) return null
  return parseOrganization(configs.organization, configs.accounts, configs.security, configs.iam, loadedFiles)
}

export function buildNetworkGraph(configs: LzaConfigs, loadedFiles?: Record<string, string>) {
  if (!configs.network) return null
  return parseNetwork(configs.network, loadedFiles)
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

export function buildIamGraph(configs: LzaConfigs, loadedFiles?: Record<string, string>) {
  if (!configs.iam) return null
  return parseIam(configs.iam, configs.accounts, loadedFiles)
}

export function buildPolicyMatrix(configs: LzaConfigs) {
  return buildPolicyMatrixImpl(configs.organization, configs.accounts)
}
