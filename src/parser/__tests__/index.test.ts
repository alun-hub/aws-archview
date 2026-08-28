import { describe, it, expect } from 'vitest'
import { parseYaml } from '../index'
import { parseNetwork } from '../networkParser'
import type { NetworkConfig } from '../types'

describe('parseYaml — missing !include handling', () => {
  it('strips nullish holes left by an unresolved !include in a sequence', () => {
    const networkConfigYaml = [
      'transitGateways:',
      '  - name: Main-TGW',
      '    account: Network',
      '    region: eu-north-1',
      'vpcs:',
      '  - !include includes_network/vpc/Present-VPC.yaml',
      '  - !include includes_network/vpc/Missing-VPC.yaml',
    ].join('\n')

    const presentVpcYaml = [
      'name: Present-VPC',
      'account: Workload',
      'region: eu-north-1',
      'cidrs:',
      '  - 10.0.0.0/22',
      'subnets:',
      '  - name: App-Private-Subnet-A',
      '    availabilityZone: a',
      '    routeTable: App-RT',
      '    ipv4CidrBlock: 10.0.0.0/24',
    ].join('\n')

    // Note: Missing-VPC.yaml is intentionally NOT provided
    const config = parseYaml<NetworkConfig>(networkConfigYaml, {
      'Present-VPC.yaml': presentVpcYaml,
    })

    expect(config.vpcs).toHaveLength(1)
    expect(config.vpcs?.every((v) => v != null)).toBe(true)
    expect(config.vpcs?.[0]?.name).toBe('Present-VPC')

    // The whole point: parseNetwork must not throw on the compacted config
    expect(() => parseNetwork(config)).not.toThrow()
    const model = parseNetwork(config)
    expect(model.nodes.some((n) => n.kind === 'vpc' && n.label === 'Present-VPC')).toBe(true)
  })

  it('leaves a nullish object property (not a sequence hole) untouched', () => {
    const yamlText = [
      'centralNetworkServices: !include missing-central.yaml',
      'vpcs: []',
    ].join('\n')

    const config = parseYaml<NetworkConfig>(yamlText, {})
    expect(config.centralNetworkServices).toBeNull()
    expect(() => parseNetwork(config)).not.toThrow()
  })
})
