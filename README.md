# AWS ArchView

Interactive architecture visualizer for [AWS Landing Zone Accelerator (LZA)](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) configurations. Drop your LZA YAML files onto the canvas and explore your AWS organization and network topology as interactive diagrams — no deployment required.

![AWS ArchView](docs/screenshot.png)

## What it does

AWS ArchView reads your LZA configuration files and renders two interactive views:

**Organization view** — shows your AWS Organizations hierarchy: root, organizational units (OUs), accounts, Service Control Policies (SCPs), IAM permission sets, and security service assignments (Security Hub, GuardDuty, etc.).

**Network view** — shows your network topology: VPCs, subnets (public/private), Transit Gateways, TGW attachments and route table propagations, and central services.

Clicking any node opens a detail panel with its full configuration properties.

## Getting started

### Prerequisites

- Node.js 18 or later
- npm

### Install and run

```bash
git clone https://github.com/your-org/aws-archview.git
cd aws-archview
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Load your configs

1. Drag and drop one or more LZA YAML files onto the **Config** panel on the left.
2. The app maps files by name — supported filenames:

| File | Content |
|---|---|
| `organization-config.yaml` | OU structure and SCPs |
| `accounts-config.yaml` | Account definitions |
| `network-config.yaml` | VPCs, subnets, TGWs |
| `security-config.yaml` | Security service assignments |
| `iam-config.yaml` | Permission sets and assignments |

3. Switch between **Organisation** and **Nätverk** (Network) in the left navigation.

### Try the sample configs

The `samples/` directory contains minimal configs that cover all views:

```bash
# Just drag these files onto the Config panel in the UI:
samples/organization-config.yaml
samples/accounts-config.yaml
samples/network-config.yaml
samples/security-config.yaml
samples/iam-config.yaml
```

The `samples-adv/` directory contains a more complete example with advanced network features (Transit Gateway, route tables, central services).

## Features

- **No backend** — everything runs in the browser; your config files never leave your machine.
- **Auto-layout** — diagrams are arranged automatically using ELK hierarchical layout.
- **Interactive** — pan, zoom, and click nodes to inspect properties.
- **AWS icon language** — nodes use official AWS Architecture Icons.
- **Multi-file** — load all five config files together for the richest view, or load just one to explore a single domain.

## Development

```bash
npm run dev      # Dev server with hot reload at http://localhost:5173
npm run build    # Type-check + production bundle → dist/
npm run lint     # ESLint
npm run test     # Vitest unit tests
```

## Tech stack

| Layer | Library |
|---|---|
| UI framework | React 19 + TypeScript + Vite |
| App shell | Cloudscape Design System |
| Diagram engine | ReactFlow (`@xyflow/react`) |
| Graph layout | ELK.js — hierarchical auto-layout |
| YAML parser | js-yaml v4 |
| Icons | Official AWS Architecture Icons |

## Project structure

```
src/
├── parser/          LZA YAML → graph model (nodes + edges)
├── store/           App state (React Context + useReducer)
├── icons/           AWS icon component
└── components/
    ├── nodes/       ReactFlow custom node components
    ├── canvas/      ELK layout + ReactFlow canvas wiring
    └── panels/      Config loader + detail panel
```

## License

MIT
