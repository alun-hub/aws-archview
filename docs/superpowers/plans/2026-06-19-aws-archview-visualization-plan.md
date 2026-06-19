# AWS ArchView Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a high-fidelity AWS 2D-style architecture visualization of Landing Zone Accelerator (LZA) configurations by nesting individual subnets, arranging them in an Availability Zone (AZ) grid, and displaying central security services in their respective accounts.

**Architecture:** 
1. Expand the parsing logic to ingest `security-config.yaml` and `iam-config.yaml` and place security service nodes (GuardDuty, Security Hub, Macie, Config, CloudTrail) under the central Security/Audit and LogArchive accounts.
2. Replace grouped subnet nodes with individual subnet nodes in `networkParser.ts`.
3. Update `elkLayout.ts` to arrange subnets inside VPCs in an AZ grid layout (columns = AZs, rows = Subnet tiers).
4. Update `GroupNode.tsx` and `AwsIcon.tsx` to match official AWS 2D architectural border colors, headers, and tabs.

**Tech Stack:** React 19, TypeScript, Vite, ReactFlow, ELK.js, Vitest (for unit tests).

---

## Plan Overview

### Files to Create/Modify:
- **Modify:** `package.json` — Add `vitest` for parser unit testing.
- **Modify:** `src/parser/types.ts` — Update parser types for Security & IAM configs.
- **Modify:** `src/parser/index.ts` — Update export functions and `LzaConfigs` type.
- **Modify:** `src/components/panels/ConfigLoader.tsx` — Add drag-and-drop support for `security-config.yaml` and `iam-config.yaml`.
- **Modify:** `src/parser/organizationParser.ts` — Implement parsing of security and IAM configs to create service nodes in `Audit`, `LogArchive`, and `Management` accounts.
- **Create:** `src/parser/__tests__/organizationParser.test.ts` — Unit tests for LZA organization/security parsing.
- **Modify:** `src/parser/networkParser.ts` — Update to parse individual subnets.
- **Create:** `src/parser/__tests__/networkParser.test.ts` — Unit tests for LZA network parsing (individual subnets).
- **Modify:** `src/components/canvas/elkLayout.ts` — Implement AZ-grid layout for subnets inside VPCs.
- **Modify:** `src/icons/AwsIcon.tsx` — Map new AWS security icons, and handle fallbacks gracefully.
- **Modify:** `src/components/nodes/GroupNode.tsx` — Upgrade boundary styles to match official AWS Org, OU, Account, VPC, and Subnet representations.
- **Modify:** `src/components/panels/DetailPanel.tsx` — Update label mappings for security services and subnet fields.

---

### Task 1: Setup Testing Environment (Vitest)

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add vitest to devDependencies and test script**
  Modify `package.json` to include `"test": "vitest run"` in scripts, and `"vitest": "^3.0.0"` in devDependencies.
  
  *Replacement in `package.json`:*
  ```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run"
  }
  ```

- [ ] **Step 2: Run npm install to install vitest**
  Run: `npm install`
  Expected: Installation completes successfully without conflicts.

- [ ] **Step 3: Commit setup**
  Run:
  ```bash
  git add package.json package-lock.json
  git commit -m "chore: setup vitest for unit testing"
  ```

---

### Task 2: Extend Config Loader & Types for Security/IAM

**Files:**
- Modify: `src/parser/types.ts`
- Modify: `src/parser/index.ts`
- Modify: `src/components/panels/ConfigLoader.tsx`

- [ ] **Step 1: Update type definitions in `src/parser/types.ts`**
  Add `SecurityConfig` and `IamConfig` references.
  
  *Replacement in `src/parser/types.ts` (around lines 110-140):*
  Make sure `SecurityConfig` and `IamConfig` are fully defined (already present in code) and referenceable.

- [ ] **Step 2: Update `LzaConfigs` in `src/parser/index.ts`**
  
  *Replacement in `src/parser/index.ts`:*
  ```typescript
  export interface LzaConfigs {
    organization?: OrganizationConfig
    accounts?: AccountsConfig
    network?: NetworkConfig
    security?: SecurityConfig
    iam?: IamConfig
  }
  ```

- [ ] **Step 3: Add `security-config.yaml` and `iam-config.yaml` to `ConfigLoader.tsx`**
  Update `FILE_MAP` and parsing cases.
  
  *Replacement in `src/components/panels/ConfigLoader.tsx`:*
  ```typescript
  const FILE_MAP: Record<string, keyof LzaConfigs> = {
    'organization-config.yaml': 'organization',
    'accounts-config.yaml': 'accounts',
    'network-config.yaml': 'network',
    'security-config.yaml': 'security',
    'iam-config.yaml': 'iam',
  }
  ```
  And in `parsedForKey`:
  ```typescript
  function parsedForKey(key: keyof LzaConfigs, content: string): Partial<LzaConfigs> {
    switch (key) {
      case 'organization':
        return { organization: parseYaml<OrganizationConfig>(content) }
      case 'accounts':
        return { accounts: parseYaml<AccountsConfig>(content) }
      case 'network':
        return { network: parseYaml<NetworkConfig>(content) }
      case 'security':
        return { security: parseYaml<SecurityConfig>(content) }
      case 'iam':
        return { iam: parseYaml<IamConfig>(content) }
    }
  }
  ```

- [ ] **Step 4: Verify type-check passes**
  Run: `npm run build`
  Expected: Successful compilation without errors.

- [ ] **Step 5: Commit config loader changes**
  Run:
  ```bash
  git add src/parser/types.ts src/parser/index.ts src/components/panels/ConfigLoader.tsx
  git commit -m "feat: extend parser types and loader for security and iam configs"
  ```

---

### Task 3: Parse Security Services in Organization Graph

**Files:**
- Modify: `src/parser/organizationParser.ts`
- Modify: `src/parser/index.ts`
- Create: `src/parser/__tests__/organizationParser.test.ts`

- [ ] **Step 1: Write unit test verifying security service injection**
  Create `src/parser/__tests__/organizationParser.test.ts` with test cases verifying that if `security-config` is loaded, GuardDuty, Security Hub, Macie, and CloudTrail nodes are added as children of the `Audit` or `LogArchive` accounts.

  *Create `src/parser/__tests__/organizationParser.test.ts`:*
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { parseOrganization } from '../organizationParser'
  import type { OrganizationConfig, AccountsConfig, SecurityConfig, IamConfig } from '../types'

  describe('organizationParser', () => {
    it('should inject security services into central accounts', () => {
      const org: OrganizationConfig = {
        enable: true,
        organizationalUnits: [{ name: 'Security' }]
      }
      const accounts: AccountsConfig = {
        mandatoryAccounts: [
          { name: 'Audit', email: 'audit@test.com', organizationalUnit: 'Security' },
          { name: 'LogArchive', email: 'logs@test.com', organizationalUnit: 'Security' },
          { name: 'Management', email: 'mgmt@test.com', organizationalUnit: 'Root' }
        ]
      }
      const security: SecurityConfig = {
        guardduty: { enable: true },
        securityHub: { enable: true },
        macie: { enable: true }
      }
      const iam: IamConfig = {
        identityCenter: { enable: true }
      }

      const model = parseOrganization(org, accounts, security, iam)
      
      const auditChildren = model.nodes.filter(n => n.parentId === 'account:Audit')
      expect(auditChildren.map(c => c.kind)).toContain('guardduty')
      expect(auditChildren.map(c => c.kind)).toContain('security-hub')
      expect(auditChildren.map(c => c.kind)).toContain('macie')

      const mgmtChildren = model.nodes.filter(n => n.parentId === 'account:Management')
      expect(mgmtChildren.map(c => c.kind)).toContain('iam')
    })
  })
  ```

- [ ] **Step 2: Run test and ensure it fails**
  Run: `npx vitest run src/parser/__tests__/organizationParser.test.ts`
  Expected: Fails because `parseOrganization` does not accept `security` or `iam` configurations yet.

- [ ] **Step 3: Implement security service injection in `organizationParser.ts`**
  Modify `parseOrganization` signature and add logic to push service nodes.
  
  *Replacement in `src/parser/organizationParser.ts`:*
  ```typescript
  export function parseOrganization(
    orgConfig: OrganizationConfig,
    accountsConfig: AccountsConfig,
    securityConfig?: SecurityConfig,
    iamConfig?: IamConfig,
  ): GraphModel {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    // ... [existing OU/Account parsing logic] ...

    // Inject Security Services
    if (securityConfig) {
      if (securityConfig.guardduty?.enable) {
        nodes.push({
          id: 'service:guardduty',
          kind: 'guardduty',
          label: 'GuardDuty',
          data: { kind: 'guardduty' },
          parentId: 'account:Audit',
        })
      }
      if (securityConfig.securityHub?.enable) {
        nodes.push({
          id: 'service:security-hub',
          kind: 'security-hub',
          label: 'Security Hub',
          data: { kind: 'security-hub' },
          parentId: 'account:Audit',
        })
      }
      if (securityConfig.macie?.enable) {
        nodes.push({
          id: 'service:macie',
          kind: 'macie',
          label: 'Macie',
          data: { kind: 'macie' },
          parentId: 'account:Audit',
        })
      }
      if (securityConfig.awsConfig?.enableConfigurationRecorder) {
        nodes.push({
          id: 'service:aws-config',
          kind: 'config',
          label: 'AWS Config',
          data: { kind: 'config' },
          parentId: 'account:Audit',
        })
      }
      if (securityConfig.cloudtrail?.enable) {
        nodes.push({
          id: 'service:cloudtrail',
          kind: 'cloudtrail',
          label: 'CloudTrail',
          data: { kind: 'cloudtrail' },
          parentId: 'account:LogArchive',
        })
      }
    }

    if (iamConfig?.identityCenter?.enable) {
      nodes.push({
        id: 'service:identity-center',
        kind: 'iam',
        label: 'IAM Identity Center',
        data: { kind: 'iam' },
        parentId: 'account:Management',
      })
    }

    return { nodes, edges }
  }
  ```
  
  *And update `src/parser/index.ts` to forward security & iam:*
  ```typescript
  export function buildOrganizationGraph(configs: LzaConfigs) {
    if (!configs.organization || !configs.accounts) return null
    return parseOrganization(configs.organization, configs.accounts, configs.security, configs.iam)
  }
  ```

- [ ] **Step 4: Run unit tests to verify they pass**
  Run: `npx vitest run src/parser/__tests__/organizationParser.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/parser/organizationParser.ts src/parser/index.ts src/parser/__tests__/organizationParser.test.ts
  git commit -m "feat: parse and inject security services in organization graph"
  ```

---

### Task 4: Parse Individual Subnets in Network Graph

**Files:**
- Modify: `src/parser/networkParser.ts`
- Create: `src/parser/__tests__/networkParser.test.ts`

- [ ] **Step 1: Write unit test verifying individual subnets are parsed**
  Create `src/parser/__tests__/networkParser.test.ts` checking that `parseNetwork` returns each subnet defined in LZA VPC config as its own node with correct type (`subnet-public` or `subnet-private`), parentId (`vpc:...`), AZ, and CIDR block.

  *Create `src/parser/__tests__/networkParser.test.ts`:*
  ```typescript
  import { describe, it, expect } from 'vitest'
  import { parseNetwork } from '../networkParser'
  import type { NetworkConfig } from '../types'

  describe('networkParser', () => {
    it('should parse individual subnets instead of grouping them', () => {
      const config: NetworkConfig = {
        vpcs: [{
          name: 'Dev-VPC',
          account: 'Dev',
          region: 'eu-west-1',
          cidrs: ['10.0.0.0/22'],
          subnets: [
            { name: 'App-Private-Subnet-A', availabilityZone: 'a', routeTable: 'App-RT', ipv4CidrBlock: '10.0.0.0/24' },
            { name: 'Public-Subnet-B', availabilityZone: 'b', routeTable: 'Public-RT', ipv4CidrBlock: '10.0.1.0/24' }
          ]
        }]
      }

      const model = parseNetwork(config)
      
      const subnets = model.nodes.filter(n => n.parentId === 'vpc:Dev-VPC:Dev')
      expect(subnets.length).toBe(2)
      
      const subA = subnets.find(s => s.label === 'App-Private-Subnet-A')
      expect(subA).toBeDefined()
      expect(subA?.kind).toBe('subnet-private')
      expect(subA?.data.cidr).toBe('10.0.0.0/24')
      expect(subA?.data.az).toBe('a')

      const subB = subnets.find(s => s.label === 'Public-Subnet-B')
      expect(subB?.kind).toBe('subnet-public')
      expect(subB?.data.cidr).toBe('10.0.1.0/24')
      expect(subB?.data.az).toBe('b')
    })
  })
  ```

- [ ] **Step 2: Run test and ensure it fails**
  Run: `npx vitest run src/parser/__tests__/networkParser.test.ts`
  Expected: FAIL because `parseNetwork` still groups subnets into container nodes instead of individual nodes.

- [ ] **Step 3: Modify `networkParser.ts` to output individual subnets**
  Modify lines 179-206 in `src/parser/networkParser.ts` to loop over all subnets and push them individually.
  
  *Replacement in `src/parser/networkParser.ts`:*
  ```typescript
    // ② Subnets — output each subnet individually
    for (const subnet of vpc.subnets ?? []) {
      const kind = subnetKind(subnet.name)
      nodes.push({
        id: `subnet:${vpc.name}:${subnet.name}`,
        kind,
        label: subnet.name,
        data: {
          kind,
          cidr: subnet.ipv4CidrBlock,
          az: subnet.availabilityZone,
          routeTable: subnet.routeTable,
        },
        parentId: vpcId,
      })
    }
  ```

- [ ] **Step 4: Run network parser tests and verify they pass**
  Run: `npx vitest run src/parser/__tests__/networkParser.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit changes**
  Run:
  ```bash
  git add src/parser/networkParser.ts src/parser/__tests__/networkParser.test.ts
  git commit -m "feat: parse individual subnets with CIDR and AZ in network parser"
  ```

---

### Task 5: Implement AZ Subnet Grid Layout in ELK Layout Engine

**Files:**
- Modify: `src/components/canvas/elkLayout.ts`

- [ ] **Step 1: Implement Grid Layout for VPC children in `elkLayout.ts`**
  Modify the `computeBox` function in `elkLayout.ts` to align subnets inside `vpc` nodes using a Grid. Rows represent subnet types (public first, then firewall, private, data, tgw), and columns represent AZs (`a`, `b`, `c`).
  
  *Replacement in `src/components/canvas/elkLayout.ts` (inside `computeBox` around lines 60-84):*
  ```typescript
  const parentKind = (node.data as { kind?: string })?.kind ?? ''
  const childPos = new Map<string, { x: number; y: number }>()

  if (parentKind === 'vpc') {
    // ── Grid Layout for Subnets in VPC ──
    const subnets = children.filter(c => c.type?.startsWith('subnet'))
    const nonSubnets = children.filter(c => !c.type?.startsWith('subnet')) // IGW, etc.

    // 1. Group subnets by Tier (Row) and AZ (Col)
    const azs = ['a', 'b', 'c']
    const tiers = ['subnet-public', 'subnet-firewall', 'subnet-private', 'subnet-tgw']
    
    // Calculate dimensions
    const cellW = 160
    const cellH = 64
    const gapX = 16
    const gapY = 16
    const startX = PAD_H
    const startY = PT

    let maxW = 200
    let maxH = 100

    // Assign positions to subnets
    for (const c of subnets) {
      const az = ((c.data as { az?: string })?.az ?? 'a').toLowerCase()
      const kind = (c.data as { kind?: string })?.kind ?? 'subnet-private'
      
      const colIndex = azs.indexOf(az) !== -1 ? azs.indexOf(az) : 0
      const rowIndex = tiers.indexOf(kind) !== -1 ? tiers.indexOf(kind) : 2 // Default to private row
      
      const x = startX + colIndex * (cellW + gapX)
      const y = startY + rowIndex * (cellH + gapY)
      childPos.set(c.id, { x, y })
      
      maxW = Math.max(maxW, x + cellW + PAD_H)
      maxH = Math.max(maxH, y + cellH + PAD_BOTTOM)
    }

    // Place non-subnet nodes (like IGW) at the very top or bottom
    let nsX = startX
    for (const c of nonSubnets) {
      childPos.set(c.id, { x: nsX, y: PT / 3 })
      nsX += cellW + gapX
    }

    return {
      width: Math.max(maxW, 300),
      height: Math.max(maxH, 150),
      childPos,
    }
  } else {
    // ── Standard flow layout for other containers ──
    const cols = maxCols(parentKind)
    const PT = padTop(parentKind)
    let rowX = PAD_H, rowY = PT, rowMaxH = 0, colsInRow = 0, totalW = 0

    for (const { id: cId, box } of childBoxes) {
      if (colsInRow >= cols && colsInRow > 0) {
        rowX = PAD_H; rowY += rowMaxH + V_GAP; rowMaxH = 0; colsInRow = 0
      }
      childPos.set(cId, { x: rowX, y: rowY })
      rowX    += box.width + H_GAP
      rowMaxH  = Math.max(rowMaxH, box.height)
      totalW   = Math.max(totalW, rowX - H_GAP + PAD_H)
      colsInRow++
    }

    return {
      width:    Math.max(totalW, 200),
      height:   Math.max(rowY + rowMaxH + PAD_BOTTOM, 100),
      childPos,
    }
  }
  ```

- [ ] **Step 2: Verify build compiles**
  Run: `npm run build`
  Expected: Successful compilation.

- [ ] **Step 3: Commit layout changes**
  Run:
  ```bash
  git add src/components/canvas/elkLayout.ts
  git commit -m "feat: implement AZ-based subnet grid layout inside VPC nodes"
  ```

---

### Task 6: Visual Boundaries & Group Styling

**Files:**
- Modify: `src/components/nodes/GroupNode.tsx`
- Modify: `src/icons/AwsIcon.tsx`
- Modify: `src/components/panels/DetailPanel.tsx`

- [ ] **Step 1: Update GroupNode.tsx for AWS 2D Boundary style**
  Update styling in `GroupNode.tsx` to add official AWS styles: colored header bars/tabs, custom borders, and metadata display. For subnets, display the CIDR and AZ block.
  
  *Replacement in `src/components/nodes/GroupNode.tsx`:*
  ```typescript
  import { Handle, Position, type NodeProps } from '@xyflow/react'
  import { AwsIcon, kindBackground, kindBorderColor, type IconKind } from '../../icons/AwsIcon'

  export interface GroupNodeData {
    label: string
    kind: string
    cidr?: string
    az?: string
    sublabel?: string
    [key: string]: unknown
  }

  export function GroupNode({ data, selected, width, height }: NodeProps) {
    const d = data as GroupNodeData
    const border = kindBorderColor(d.kind)
    const bg = kindBackground(d.kind)
    
    const isSubnet = d.kind.startsWith('subnet')
    const borderStyle = isSubnet || d.kind === 'on-premises' ? 'dashed' : 'solid'
    
    // AWS Header styles
    const renderHeader = () => {
      if (isSubnet) {
        return (
          <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AwsIcon kind={d.kind as IconKind} size={16} />
            <div style={{ fontSize: 10, fontWeight: 700, color: border, fontFamily: 'sans-serif' }}>
              {d.label} {d.cidr ? `(${d.cidr})` : ''} {d.az ? `[AZ: ${d.az.toUpperCase()}]` : ''}
            </div>
          </div>
        )
      }

      return (
        <div 
          style={{ 
            background: border, 
            color: '#fff', 
            padding: '3px 8px', 
            borderTopLeftRadius: 8, 
            borderTopRightRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'sans-serif'
          }}
        >
          <AwsIcon kind={d.kind as IconKind} size={14} style={{ filter: 'brightness(0) invert(1)' }} />
          <span>{d.label} {d.sublabel ? `(${d.sublabel})` : ''}</span>
        </div>
      )
    }

    return (
      <div
        style={{
          width: width ?? 200,
          height: height ?? 80,
          border: `2px ${borderStyle} ${border}`,
          borderRadius: 8,
          background: selected ? bg.replace(/0\.\d+\)/, '0.15)') : bg,
          position: 'relative',
          boxSizing: 'border-box',
          boxShadow: selected ? `0 0 0 3px ${border}44` : '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {renderHeader()}
        
        {/* Child container area */}
        <div style={{ flex: 1, position: 'relative' }} />

        <Handle type="source" position={Position.Top}    id="top-s"    style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Top}    id="top-t"    style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Bottom} id="bottom-s" style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Bottom} id="bottom-t" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Left}   id="left-s"   style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Left}   id="left-t"   style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right}  id="right-s"  style={{ opacity: 0 }} />
        <Handle type="target" position={Position.Right}  id="right-t"  style={{ opacity: 0 }} />
      </div>
    )
  }
  ```

- [ ] **Step 2: Update AwsIcon.tsx mappings and labels in DetailPanel.tsx**
  Update `KIND_LABEL` and `KIND_COLOR` in `DetailPanel.tsx` to handle security services properly.
  
  *Replacement in `src/components/panels/DetailPanel.tsx` (around lines 3-30):*
  ```typescript
  const KIND_LABEL: Record<string, string> = {
    root:           'Organization Root',
    ou:             'Organizational Unit',
    account:        'AWS Account',
    vpc:            'VPC',
    subnet:         'Subnet',
    'subnet-public':  'Public Subnet',
    'subnet-private': 'Private Subnet',
    'subnet-firewall':'Firewall Subnet',
    'subnet-tgw':     'TGW Attachment Subnet',
    tgw:            'Transit Gateway',
    'tgw-rt-group': 'Route Table Group',
    'tgw-rt':       'TGW Route Table',
    vpn:            'VPN Connection',
    cgw:            'Customer Gateway',
    igw:            'Internet Gateway',
    'on-premises':  'On-Premises',
    'security-hub': 'Security Hub',
    guardduty:      'GuardDuty',
    macie:          'Macie',
    config:         'AWS Config',
    cloudtrail:     'CloudTrail',
    iam:            'IAM Identity Center',
    service:        'AWS Service',
  }

  const KIND_COLOR: Record<string, string> = {
    root:           '#E7157B',
    ou:             '#E7157B',
    account:        '#FF9900',
    'management-account': '#FF9900',
    vpc:            '#8C4FFF',
    'subnet-public':  '#248814',
    'subnet-private': '#1A6CAE',
    'subnet-firewall':'#CC3300',
    'subnet-tgw':     '#6B3FA0',
    tgw:            '#6B3FA0',
    'tgw-rt-group': '#6B3FA0',
    'tgw-rt':       '#6B3FA0',
    vpn:            '#CC7700',
    cgw:            '#CC7700',
    igw:            '#007DB8',
    'on-premises':  '#5A5A5A',
  }
  ```

- [ ] **Step 3: Run Vitest unit tests to ensure everything is correct**
  Run: `npx vitest run`
  Expected: All unit tests pass.

- [ ] **Step 4: Build project production bundle to check for TypeScript compiler warnings**
  Run: `npm run build`
  Expected: Built successfully.

- [ ] **Step 5: Commit visual modifications**
  Run:
  ```bash
  git add src/components/nodes/GroupNode.tsx src/icons/AwsIcon.tsx src/components/panels/DetailPanel.tsx
  git commit -m "style: apply official AWS 2D group styling and security panel labels"
  ```
