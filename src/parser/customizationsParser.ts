import type { CustomizationsConfig, GraphEdge, GraphModel, GraphNode } from './types'

interface StackEntry {
  name: string
  description?: string
  template?: string
  regions?: string[]
  isStackSet: boolean
  parameters?: { name: string; value: string }[]
  deploymentTargets?: { accounts?: string[]; organizationalUnits?: string[] }
}

export function parseCustomizations(cfg: CustomizationsConfig, aggregateStacks: boolean = true): GraphModel {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  const allStacks: StackEntry[] = [
    ...(cfg.cloudFormationStacks    ?? []).map(s => ({ ...s, isStackSet: false })),
    ...(cfg.cloudFormationStackSets ?? []).map(s => ({ ...s, isStackSet: true  })),
  ]

  if (allStacks.length === 0 && !(cfg.serviceCatalogPortfolios?.length)) {
    return { nodes, edges }
  }

  // Build: target group → stacks deployed there
  const ouMap      = new Map<string, StackEntry[]>()
  const accountMap = new Map<string, StackEntry[]>()

  for (const stack of allStacks) {
    const dt = stack.deploymentTargets
    const ous      = dt?.organizationalUnits ?? []
    const accounts = dt?.accounts ?? []

    if (ous.length === 0 && accounts.length === 0) {
      // No specific target — put under a special "Global" OU
      const arr = ouMap.get('__all__') ?? []
      arr.push(stack)
      ouMap.set('__all__', arr)
    }
    for (const ou of ous) {
      const arr = ouMap.get(ou) ?? []
      arr.push(stack)
      ouMap.set(ou, arr)
    }
    for (const acc of accounts) {
      const arr = accountMap.get(acc) ?? []
      arr.push(stack)
      accountMap.set(acc, arr)
    }
  }

  let stackIdx = 0
  const addStacks = (parentId: string, stacks: StackEntry[]) => {
    if (aggregateStacks && stacks.length > 1) {
      const childId = `cfn-aggregate:${parentId}`
      nodes.push({
        id: childId,
        kind: 'cloudformation',
        label: `CloudFormation Stacks (${stacks.length})`,
        data: {
          kind: 'cloudformation',
          isAggregate: true,
          stacks: stacks,
          sublabel: `${stacks.filter(s => s.isStackSet).length} StackSets · ${stacks.filter(s => !s.isStackSet).length} Stacks`,
        },
        parentId,
      })
    } else {
      for (const stack of stacks) {
        const childId = `cfn-stack:${stackIdx++}:${stack.name}`
        nodes.push({
          id: childId,
          kind: 'cloudformation',
          label: stack.name,
          data: {
            kind: 'cloudformation',
            isStackSet: stack.isStackSet,
            description: stack.description,
            template: stack.template,
            regions: stack.regions,
            parameters: stack.parameters,
            sublabel: stack.isStackSet
              ? `StackSet · ${stack.regions?.join(', ') ?? ''}`
              : stack.regions?.join(', ') ?? '',
          },
          parentId,
        })
      }
    }
  }

  // OU group nodes
  for (const [ouName, stacks] of ouMap) {
    const groupId = `cfn-ou:${ouName}`
    nodes.push({
      id: groupId,
      kind: 'ou',
      label: ouName === '__all__' ? 'All OUs' : ouName,
      data: { kind: 'ou' },
    })
    addStacks(groupId, stacks)
  }

  // Account group nodes
  for (const [accName, stacks] of accountMap) {
    const groupId = `cfn-account:${accName}`
    nodes.push({
      id: groupId,
      kind: 'account',
      label: accName,
      data: { kind: 'account' },
    })
    addStacks(groupId, stacks)
  }

  // Service Catalog portfolios as separate OU-style groups
  for (const portfolio of cfg.serviceCatalogPortfolios ?? []) {
    const groupId = `sc-portfolio:${portfolio.name}`
    nodes.push({
      id: groupId,
      kind: 'service-catalog',
      label: portfolio.name,
      data: {
        kind: 'service-catalog',
        description: portfolio.description,
        provider: portfolio.provider,
        regions: portfolio.regions,
        sublabel: portfolio.provider ?? '',
      },
    })
  }

  return { nodes, edges }
}
