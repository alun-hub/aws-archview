import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import * as yaml from 'js-yaml'
import { SAMPLE_CONFIGS } from '../sampleConfigs'

/**
 * The samples validated against the JSON Schemas LZA ships and validates with
 * itself. This is the only check that answers "would this configuration
 * actually deploy?" — our own rules only cover what we chose to model, and the
 * samples are invented, so nothing else here can tell us they are realistic.
 *
 * It found 32 errors across four sample files the first time it was run,
 * including a Service Catalog portfolio using `deploymentTargets` (it takes
 * `account` and `shareTargets`), Transit Gateways missing required
 * `dnsSupport`/`vpnEcmpSupport`, and stateless firewall rules using objects
 * where the schema takes plain CIDR strings.
 *
 * Opt-in, because it needs an LZA checkout:
 *
 *   git clone --depth 1 --filter=blob:none --sparse \
 *     https://github.com/awslabs/landing-zone-accelerator-on-aws /tmp/lza
 *   cd /tmp/lza && git sparse-checkout set source/packages/@aws-accelerator/config
 *   LZA_PATH=/tmp/lza npm test
 */
const SCHEMA_DIR = process.env.LZA_PATH
  ? `${process.env.LZA_PATH}/source/packages/@aws-accelerator/config/lib/schemas`
  : undefined

const FILES: Record<string, string> = {
  'accounts-config.yaml': 'accounts-config.json',
  'organization-config.yaml': 'organization-config.json',
  'iam-config.yaml': 'iam-config.json',
  'security-config.yaml': 'security-config.json',
  'network-config.yaml': 'network-config.json',
  'global-config.yaml': 'global-config.json',
  'customizations-config.yaml': 'customizations-config.json',
}

describe.skipIf(!SCHEMA_DIR || !existsSync(SCHEMA_DIR))('samples against the LZA schemas', () => {
  for (const [configName, schemaName] of Object.entries(FILES)) {
    it(configName, () => {
      const ajv = new Ajv({ allErrors: true, strict: false })
      addFormats(ajv)
      const validate = ajv.compile(JSON.parse(readFileSync(`${SCHEMA_DIR}/${schemaName}`, 'utf8')))

      const raw = SAMPLE_CONFIGS[configName]
      expect(raw, `${configName} missing from SAMPLE_CONFIGS`).toBeTruthy()
      const doc = yaml.load(raw)

      const ok = validate(doc)
      // anyOf/oneOf wrappers repeat their branch failures; the specific
      // keyword errors underneath say what is actually wrong.
      const errors = (validate.errors ?? [])
        .filter((e) => e.keyword !== 'anyOf' && e.keyword !== 'oneOf')
        .map((e) => `${e.instancePath || '/'} ${e.keyword} ${JSON.stringify(e.params)}`)
      expect(errors, `${configName} does not match the LZA schema`).toEqual([])
      expect(ok).toBe(true)
    })
  }
})
