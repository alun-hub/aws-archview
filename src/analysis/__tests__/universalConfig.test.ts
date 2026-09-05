import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildNetworkGraph, parsedForKey, resolveConfigKey, type LzaConfigs } from '../../parser'
import { runValidation } from '..'

/**
 * The rules checked against a real, AWS-published LZA configuration:
 * https://github.com/awslabs/lza-universal-configuration
 *
 * `samples/` is invented — it can show a rule is quiet on a config we wrote,
 * which is circular. This is the corpus that actually tests the rules, and it
 * is where the object-vs-string shape of `routeTableAssociations`, the nesting
 * of Transit Gateway route tables, and the `vpcTemplates` shape were all found
 * to be wrong.
 *
 * Opt-in, because it needs a checkout:
 *
 *   git clone --depth 1 https://github.com/awslabs/lza-universal-configuration \
 *     /tmp/lza-uc && LZA_UC_PATH=/tmp/lza-uc npm test
 *
 * Findings here are false positives until proven otherwise: this config is the
 * reference AWS ships.
 */
const UC = process.env.LZA_UC_PATH

const BASE_FILES = [
  'accounts-config.yaml', 'global-config.yaml', 'iam-config.yaml',
  'organization-config.yaml', 'security-config.yaml',
]

const VARIANTS: Record<string, string> = {
  'hub-and-spoke': 'modules/network/hub-and-spoke',
  'shared-vpc': 'modules/network/shared-vpc',
}

function loadVariant(root: string, networkDir: string) {
  const files: Record<string, string> = {}
  const read = (path: string, as: string) => {
    if (existsSync(path)) files[as] = readFileSync(path, 'utf8')
  }
  for (const f of BASE_FILES) read(`${root}/modules/base/default/${f}`, f)
  read(`${root}/${networkDir}/network-config.yaml`, 'network-config.yaml')
  // The replacement values the config's {{ }} tokens resolve against.
  read(`${root}/replacements/replacements-for-aws-standard.yaml`, 'replacements-config.yaml')

  const configs: LzaConfigs = {}
  const parseErrors: Record<string, string> = {}
  for (const [name, content] of Object.entries(files)) {
    const key = resolveConfigKey(name)
    if (!key) continue
    try {
      Object.assign(configs, parsedForKey(key, content, files))
    } catch (e) {
      parseErrors[name] = e instanceof Error ? e.message : String(e)
    }
  }
  return { files, configs, parseErrors }
}

describe.skipIf(!UC)('LZA Universal Configuration', () => {
  for (const [name, dir] of Object.entries(VARIANTS)) {
    describe(name, () => {
      const { files, configs, parseErrors } = loadVariant(UC!, dir)

      it('parses', () => {
        expect(parseErrors).toEqual({})
        expect(configs.network?.vpcs?.length ?? 0).toBeGreaterThan(0)
        expect(configs.organization?.organizationalUnits?.length ?? 0).toBeGreaterThan(0)
      })

      it('renders every VPC, including the templated ones', () => {
        // UC's hub-and-spoke declares its dev/test/prod workload VPCs as
        // `vpcTemplates`. Reading only `vpcs` drew the hub and none of the
        // spokes, which is the bug this asserts against.
        const templates = configs.network?.vpcTemplates ?? []
        const graph = buildNetworkGraph(configs)!
        const vpcNodes = graph.nodes.filter((n) => n.kind === 'vpc')

        expect(vpcNodes.length).toBeGreaterThanOrEqual(configs.network?.vpcs?.length ?? 0)
        for (const template of templates) {
          const rendered = vpcNodes.filter((n) => n.data.fromVpcTemplate === template.name)
          expect(rendered.length).toBeGreaterThan(0)
        }
      })

      it('produces no findings', () => {
        const findings = runValidation({ configs, loadedFiles: files, parseErrors })
          .map((f) => `[${f.severity}] ${f.ruleId}: ${f.detail}`)
        expect(findings).toEqual([])
      })
    })
  }
})
