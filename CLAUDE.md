# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**AWS ArchView** — Interactive architecture visualizer for AWS Landing Zone Accelerator (LZA) configurations. Reads LZA YAML config files and renders an interactive diagram using the AWS visual language.

**Status:** Working MVP with Organization and Network views.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Type-check + production bundle (dist/)
npm run lint      # ESLint
```

## Stack

| Layer | Library |
|---|---|
| UI framework | React 19 + TypeScript + Vite |
| App shell | Cloudscape Design System (`@cloudscape-design/components`) |
| Diagram engine | ReactFlow (`@xyflow/react`) |
| Graph layout | ELK.js (`elkjs`) — hierarchical auto-layout |
| YAML parser | `js-yaml` v4 (DEFAULT_SCHEMA, safe by default) |
| Icons | Inline SVG placeholders — replace with official AWS Architecture Icons |

## Architecture

```
src/
├── parser/
│   ├── types.ts              LZA config TypeScript types + GraphModel (nodes/edges)
│   ├── organizationParser.ts Converts org + accounts YAML → GraphModel
│   ├── networkParser.ts      Converts network YAML → GraphModel
│   └── index.ts              Public API: parseYaml, buildOrganizationGraph, buildNetworkGraph
├── store/
│   └── configStore.tsx       React Context + useReducer state (loaded configs, active view, selected node)
├── icons/
│   └── AwsIcon.tsx           Icon component — colored SVG placeholders per node kind
├── components/
│   ├── nodes/                ReactFlow custom node components (OUNode, AccountNode, VpcNode)
│   ├── canvas/
│   │   ├── elkLayout.ts      ELK layout: converts ReactFlow nodes/edges → positioned nodes
│   │   └── DiagramCanvas.tsx ReactFlow canvas wiring up nodes, edges, ELK layout, click handlers
│   └── panels/
│       ├── ConfigLoader.tsx  Drag-and-drop YAML file loader; maps filenames to config keys
│       └── DetailPanel.tsx   Displays selected node properties
└── App.tsx                   Cloudscape AppLayout: left nav (views), tools panel (config + detail), main canvas
```

## Data flow

1. User drops YAML files → `ConfigLoader` reads them → `parseYaml` → stored in `configStore`
2. `App.tsx` calls `buildOrganizationGraph` / `buildNetworkGraph` (memoized) → `GraphModel`
3. `DiagramCanvas` converts `GraphModel` → ReactFlow nodes/edges → `applyElkLayout` → rendered

## AWS icons

Official AWS Architecture Icons SVGs are bundled in `public/icons/aws/` (sourced from the
official AWS Architecture Icons download). `src/icons/AwsIcon.tsx` renders them via `<img>` tags.
License: AWS IP — see aws.amazon.com/terms/. Do not modify SVG artwork.

To refresh icons, download the latest ZIP from `aws.amazon.com/architecture/icons/` and
re-run the copy commands in the project history. Current icons: `tgw`, `vpc`, `account`,
`ou`, `root`, `subnet-public`, `subnet-private`, `organizations`, `security-hub`, `guardduty`,
`iam`, `s3`, `config`, `cloudtrail`, `control-tower`.

## Sample configs

`samples/` contains minimal LZA YAML files for testing all three views:
- `organization-config.yaml`
- `accounts-config.yaml`
- `network-config.yaml`

## MCP Servers

- `gemini-design` is enabled — use it for frontend design tasks.
