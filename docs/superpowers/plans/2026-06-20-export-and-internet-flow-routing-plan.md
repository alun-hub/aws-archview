# Export Panels Exclusion and Internet Flow Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide UI panels from exported diagram files and move the internet node to Zone A (far-left) with horizontal line routing.

**Architecture:** We will adjust the ELK.js positioning engine to place the internet node at the start of Zone A (vertically centered next to top-aligned hub accounts). We will also assign specific side handles to the internet-target edges in DiagramCanvas to draw horizontal-like orthogonal lines. Lastly, the `react-flow__panel` class is added to the exclusion list in `exportUtils` to hide all UI overlays from captures.

**Tech Stack:** React 19, TypeScript, ReactFlow (@xyflow/react), ELK.js, Vitest.

---

### Task 1: Exclude Panels in exportUtils

**Files:**
- Modify: `src/components/canvas/exportUtils.ts`

- [ ] **Step 1: Verify 'react-flow__panel' is added to EXCLUDE list**
  Verify that lines 6-7 contain:
  ```typescript
  const EXCLUDE = ['react-flow__controls', 'react-flow__minimap', 'export-menu-panel', 'react-flow__background', 'react-flow__panel']
  const captureFilter = (node: Element) => !EXCLUDE.some((c) => node.classList?.contains(c))
  ```
  If not already there, modify the file.

- [ ] **Step 2: Commit Task 1**
  Run:
  ```bash
  git add src/components/canvas/exportUtils.ts
  git commit -m "fix: exclude react-flow__panel elements from image and PDF exports"
  ```

---

### Task 2: Reposition Internet Node in elkLayout

**Files:**
- Modify: `src/components/canvas/elkLayout.ts`

- [ ] **Step 1: Extract and exclude internetNode from spokeNodes**
  Replace lines 249-255:
  ```typescript
    const hubNodes    = roots.filter((n) => hubSet.has(n.id))
    const spokeNodes  = roots.filter((n) => {
      const kind = (n.data as { kind?: string })?.kind
      return !hubSet.has(n.id) && kind !== 'tgw' && kind !== 'on-premises' && kind !== 'tgw-rt-group'
    })
  ```
  with:
  ```typescript
    const hubNodes    = roots.filter((n) => hubSet.has(n.id))
    const internetNode = roots.find((n) => n.id === 'internet')
    const spokeNodes  = roots.filter((n) => {
      const kind = (n.data as { kind?: string })?.kind
      return !hubSet.has(n.id) && kind !== 'tgw' && kind !== 'on-premises' && kind !== 'tgw-rt-group' && n.id !== 'internet'
    })
  ```

- [ ] **Step 2: Update Zone A dimension computations**
  Replace lines 257-260 (in the "Compute zone widths for centering" section):
  ```typescript
    // Zone A (top): hub accounts side by side
    const hubW = hubNodes.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
    const hubH = hubNodes.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)
  ```
  with:
  ```typescript
    // Zone A (top): internet node + hub accounts side by side
    const zoneAItems = internetNode ? [internetNode, ...hubNodes] : hubNodes
    const zoneAW = zoneAItems.reduce((s, n, i) => s + boxOf.get(n.id)!.width + (i > 0 ? R_H : 0), 0)
    const zoneAH = zoneAItems.reduce((m, n) => Math.max(m, boxOf.get(n.id)!.height), 0)
  ```

- [ ] **Step 3: Update refW to use zoneAW**
  Replace line 283:
  ```typescript
    const refW = Math.max(hubW, firstSpokeRowW, tgwW, zoneBTotalW)
  ```
  with:
  ```typescript
    const refW = Math.max(zoneAW, firstSpokeRowW, tgwW, zoneBTotalW)
  ```

- [ ] **Step 4: Update Zone B offset to use zoneAH**
  Replace line 297:
  ```typescript
    const zoneBY = zoneAY + (hubH > 0 ? hubH + HUB_TO_TGW : 0)
  ```
  with:
  ```typescript
    const zoneBY = zoneAY + (zoneAH > 0 ? zoneAH + HUB_TO_TGW : 0)
  ```

- [ ] **Step 5: Lay out Zone A items with internet vertically centered**
  Replace lines 288-294:
  ```typescript
    const zoneAY = 0
    const hubStartX = Math.round((refW - hubW) / 2)
    let hx = hubStartX
    for (const n of hubNodes) {
      rootPos.set(n.id, { x: hx, y: zoneAY })
      hx += boxOf.get(n.id)!.width + R_H
    }
  ```
  with:
  ```typescript
    const zoneAY = 0
    const zoneAStartX = Math.round((refW - zoneAW) / 2)
    let ax = zoneAStartX
    for (const n of zoneAItems) {
      const h = boxOf.get(n.id)!.height
      const yOffset = n.id === 'internet'
        ? Math.round((zoneAH - h) / 2)
        : 0 // Keep hub accounts top-aligned
      rootPos.set(n.id, { x: ax, y: zoneAY + yOffset })
      ax += boxOf.get(n.id)!.width + R_H
    }
  ```

- [ ] **Step 6: Commit Task 2**
  Run:
  ```bash
  git add src/components/canvas/elkLayout.ts
  git commit -m "style: position internet cloud node on the far-left in Zone A"
  ```

---

### Task 3: Set Edge Handles for Internet Connections

**Files:**
- Modify: `src/components/canvas/DiagramCanvas.tsx`

- [ ] **Step 1: Set source/target handles for target 'internet'**
  Modify the `toFlowEdges` function inside `src/components/canvas/DiagramCanvas.tsx` (around lines 204-207):
  ```typescript
      } else if (isPeering) {
        sourceHandle = 'right-s'
        targetHandle = 'left-t'
      }
  ```
  Replace with:
  ```typescript
      } else if (isPeering) {
        sourceHandle = 'right-s'
        targetHandle = 'left-t'
      } else if (e.target === 'internet') {
        sourceHandle = 'left-s'
        targetHandle = 'right-t'
      }
  ```

- [ ] **Step 2: Commit Task 3**
  Run:
  ```bash
  git add src/components/canvas/DiagramCanvas.tsx
  git commit -m "style: route internet flow edges horizontally using left/right handles"
  ```

---

### Task 4: Verification

- [ ] **Step 1: Verify tests pass**
  Run: `npm run test -- --run`
  Expected: All tests pass.

- [ ] **Step 2: Verify production build and linting**
  Run: `npm run build && npm run lint`
  Expected: Succeeded.
