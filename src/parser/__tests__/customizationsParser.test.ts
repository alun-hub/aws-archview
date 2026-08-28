import { describe, it, expect } from 'vitest'
import { parseCustomizations } from '../customizationsParser'
import type { CustomizationsConfig } from '../types'

const stacks = [
  { name: 'InspectorSetupGlobal' },
  { name: 'InspectorSetupRegional' },
  { name: 'SsmServiceSetting' },
]

describe('customizationsParser', () => {
  it('reads stacks nested under the LZA `customizations:` key', () => {
    const cfg: CustomizationsConfig = {
      applications: [],
      customizations: { cloudFormationStacks: stacks },
    }

    const model = parseCustomizations(cfg, false)
    const stackNodes = model.nodes.filter((n) => n.kind === 'cloudformation')
    expect(stackNodes.map((n) => n.label).sort()).toEqual(
      ['InspectorSetupGlobal', 'InspectorSetupRegional', 'SsmServiceSetting'],
    )
  })

  it('still accepts a flat top-level layout', () => {
    const cfg: CustomizationsConfig = { cloudFormationStacks: stacks }
    const model = parseCustomizations(cfg, false)
    expect(model.nodes.filter((n) => n.kind === 'cloudformation')).toHaveLength(3)
  })

  it('reads stacksets and service catalog portfolios from the nested block', () => {
    const cfg: CustomizationsConfig = {
      customizations: {
        cloudFormationStackSets: [{ name: 'SSM-Config', regions: ['eu-north-1'] }],
        serviceCatalogPortfolios: [{ name: 'Platform-Products', provider: 'Platform Eng' }],
      },
    }
    const model = parseCustomizations(cfg, false)
    expect(model.nodes.some((n) => n.kind === 'cloudformation' && n.label === 'SSM-Config')).toBe(true)
    expect(model.nodes.some((n) => n.kind === 'service-catalog' && n.label === 'Platform-Products')).toBe(true)
  })

  it('returns an empty model when there is no customization content', () => {
    expect(parseCustomizations({ applications: [], customizations: {} }).nodes).toHaveLength(0)
  })
})
