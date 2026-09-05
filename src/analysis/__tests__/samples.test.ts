import { describe, it, expect } from 'vitest'
import { parsedForKey, resolveConfigKey, type LzaConfigs } from '../../parser'
import { SAMPLE_CONFIGS } from '../../parser/sampleConfigs'
import { runValidation } from '..'

/**
 * `samples/` is the config people meet first, via "Try a sample config" — so it
 * has to be a config worth copying, and it doubles as the corpus that catches a
 * rule which has started crying wolf. A new rule firing here is a false
 * positive until proven otherwise.
 *
 * The one expected finding is real and deliberate: the inspection VPC's
 * attachment associates a route table without propagating into one, which is
 * how a hub-and-spoke inspection pattern is normally wired. It is exactly the
 * kind of thing a warning is for — worth a second look, not a defect.
 */
const EXPECTED_RULE_IDS = ['tgw-attachment-no-propagation']

function loadSamples() {
  // The same bundled contents the "Try a sample config" button loads, rather
  // than a directory read — so this checks what users actually get, and needs
  // no filesystem access in a browser-targeted project.
  const files = SAMPLE_CONFIGS

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

describe('sample configs', () => {
  const { files, configs, parseErrors } = loadSamples()
  const findings = runValidation({ configs, loadedFiles: files, parseErrors })

  it('parses every sample file', () => {
    expect(parseErrors).toEqual({})
  })

  it('produces no findings beyond the deliberate one', () => {
    // Printed in full on failure: a new rule's false positives are far easier
    // to judge from the message than from a count.
    const unexpected = findings
      .filter((f) => !EXPECTED_RULE_IDS.includes(f.ruleId))
      .map((f) => `[${f.severity}] ${f.ruleId}: ${f.detail}`)
    expect(unexpected).toEqual([])
  })

  it('still reports the inspection VPC attachment', () => {
    // Guards the other direction: if this stops firing, the rule or the sample
    // changed and one of them is wrong.
    expect(findings.map((f) => f.ruleId)).toEqual(['tgw-attachment-no-propagation'])
  })
})
