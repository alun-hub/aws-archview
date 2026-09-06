import { describe, it, expect } from 'vitest'
import { parsedForKey, resolveConfigKey, type LzaConfigs } from '../../parser'
import { SAMPLE_CONFIGS, SAMPLE_CONFIGS_WITH_FINDINGS } from '../../parser/sampleConfigs'
import { runValidation } from '..'

/**
 * `samples/` is the config people meet first, via "Try a sample config" — so it
 * has to be a config worth copying, and it doubles as the corpus that catches a
 * rule which has started crying wolf. A new rule firing here is a false
 * positive until proven otherwise.
 *
 * It is expected to be completely clean. The inspection VPC's attachment
 * associates a route table without propagating into one, which used to be
 * reported — until checking the LZA schema showed that a static route on the
 * Transit Gateway route table is how such an attachment is reached. The sample
 * now carries that route, and the rule correctly says nothing.
 */
const EXPECTED_RULE_IDS: string[] = []

/** Parses a bundled sample set — the same contents the loader buttons use,
 *  rather than a directory read, so this checks what users actually get. */
function load(files: Record<string, string>) {
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
  const { files, configs, parseErrors } = load(SAMPLE_CONFIGS)
  const findings = runValidation({ configs, loadedFiles: files, parseErrors })

  it('parses every sample file', () => {
    expect(parseErrors).toEqual({})
  })

  it('produces no findings', () => {
    // Printed in full on failure: a new rule's false positives are far easier
    // to judge from the message than from a count.
    const unexpected = findings
      .filter((f) => !EXPECTED_RULE_IDS.includes(f.ruleId))
      .map((f) => `[${f.severity}] ${f.ruleId}: ${f.detail}`)
    expect(unexpected).toEqual([])
  })

  it('is clean', () => {
    expect(findings).toEqual([])
  })
})

/**
 * The deliberately flawed variant behind "…with issues". Its whole job is to
 * demonstrate the rule engine, so a rule going quiet here is a regression in
 * the demo even when the config is unchanged.
 */
describe('sample configs with issues', () => {
  const { files, configs, parseErrors } = load(SAMPLE_CONFIGS_WITH_FINDINGS)
  const findings = runValidation({ configs, loadedFiles: files, parseErrors })

  it('parses', () => {
    expect(parseErrors).toEqual({})
  })

  it('demonstrates every mistake it was built to show', () => {
    expect(new Set(findings.map((f) => f.ruleId))).toEqual(new Set([
      'unknown-deployment-target',   // an OU and an account that do not exist
      'empty-deployment-target',     // a stack on a parent OU, reaching nothing
      'vpc-cidr-overlap',            // two VPCs sharing a Transit Gateway
      'subnet-cidr-overlap',         // two subnets in one VPC
      'tgw-attachment-no-propagation',
      'vpc-without-flow-logs',
    ]))
  })

  it('covers all three severities, so the panel shows its full range', () => {
    expect(new Set(findings.map((f) => f.severity))).toEqual(new Set(['error', 'warning', 'info']))
  })
})
