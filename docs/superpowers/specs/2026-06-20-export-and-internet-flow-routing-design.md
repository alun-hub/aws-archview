# Export Panels Exclusion and Internet Flow Routing Design

## Goal
Improve the diagram presentation and exports by:
1. Excluding the search bar, shortcuts/legend panels, and export menus from exported diagram images/PDFs.
2. Re-routing the green `Internet Flow` connections so they do not cross behind Route Tables or other transit resources in Zone B.

## Architecture & Implementation Details

### 1. Panel Exclusion from Exports
To prevent UI overlay panels from being included in the exported PNG, SVG, or PDF files, we will use the default React Flow class name `react-flow__panel`.
- **Target File:** [src/components/canvas/exportUtils.ts](file:///home/alun/aws-archview/src/components/canvas/exportUtils.ts)
- **Change:** Add `'react-flow__panel'` to the `EXCLUDE` filter array.

### 2. Internet Flow Node Positioning (Zone A)
The `internet` node represents external internet access and is currently placed in Zone C (as a spoke), causing its connection to go straight up through Zone B.
- **Target File:** [src/components/canvas/elkLayout.ts](file:///home/alun/aws-archview/src/components/canvas/elkLayout.ts)
- **Changes:**
  - Locate the `internet` node (`id === 'internet'`) in `roots` and separate it from `spokeNodes`.
  - Place `internet` at the far-left of Zone A by prepending it to `zoneAItems` (which will contain `[internetNode, ...hubNodes]`).
  - Calculate `zoneAW` and `zoneAH` based on all `zoneAItems`.
  - Position the `internet` node centered vertically within Zone A (`yOffset = (zoneAH - internetNode.height) / 2`) to align nicely with the vertical level of the Internet Gateway (IGW) inside the `Network` account VPC, while keeping the hub accounts top-aligned.
  - Ensure Zone B's Y coordinate starts below `zoneAH` plus spacing.

### 3. Internet Flow Connection Handles
To route the connection horizontally from the Internet Gateway (IGW) inside the `Network` account VPC to the `internet` node on the far left.
- **Target File:** [src/components/canvas/DiagramCanvas.tsx](file:///home/alun/aws-archview/src/components/canvas/DiagramCanvas.tsx)
- **Change:** Update the `toFlowEdges` converter function. If `e.target === 'internet'`, set `sourceHandle` to `'left-s'` and `targetHandle` to `'right-t'`. This will generate an orthogonal step path connecting the left side of the IGW to the right side of the Internet cloud node.

## Verification Plan
1. **Lint & Type-check:** Run `npm run lint` and `npm run build` to verify compilation.
2. **Unit Tests:** Run `npm run test` to verify that existing graph model parsing and structure assertions continue to pass successfully.
