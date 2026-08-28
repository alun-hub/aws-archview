import { describe, it, expect } from 'vitest'
import { parseYaml, findUnresolvedReplacements } from '../index'
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

  it('resolves {{ tokens }} when replacements-config.yaml sits under a folder prefix', () => {
    const replacements = [
      'globalReplacements:',
      '  - key: Classification',
      '    type: String',
      '    value: Restricted',
      '  - key: Stage',
      '    type: String',
      '    value: Prod',
    ].join('\n')

    const networkYaml = [
      'vpcs:',
      '  - !include includes_network/vpc/{{ Classification }}-{{ Stage }}-CVpn.yaml',
    ].join('\n')

    const vpcYaml = [
      'name: Restricted-Prod-CVpn',
      'account: Network',
      'region: eu-north-1',
      'cidrs: [10.9.0.0/22]',
    ].join('\n')

    // Folder drop → every key carries the "my-lza/" prefix
    const config = parseYaml<NetworkConfig>(networkYaml, {
      'my-lza/replacements-config.yaml': replacements,
      'my-lza/includes_network/vpc/Restricted-Prod-CVpn.yaml': vpcYaml,
    })

    expect(config.vpcs).toHaveLength(1)
    expect(config.vpcs?.[0]?.name).toBe('Restricted-Prod-CVpn')
  })

  it('reports {{ tokens }} in !include paths that have no replacement value', () => {
    const files = {
      'my-lza/network-config.yaml': [
        'vpcs:',
        '  - !include includes/{{ Classification }}-{{ Stage }}-{{ RegionName }}-CVpn.yaml',
      ].join('\n'),
      'my-lza/replacements-config.yaml': 'globalReplacements:\n  - key: Stage\n    value: Prod\n',
    }
    expect(findUnresolvedReplacements(files)).toEqual(['Classification', 'RegionName'])
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
