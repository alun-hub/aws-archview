# AWS ArchView

AWS ArchView is an interactive, browser-based architecture visualizer for [AWS Landing Zone Accelerator (LZA)](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) configurations. Simply drag and drop your LZA configuration YAML files onto the canvas to map out and explore your organization structure and network topologies.

Because AWS ArchView is a pure client-side web application, **no server-side processing is performed, and your data never leaves your browser**.

---

## Key Features

### 1. Multi-View Architecture Visualization
- **Organization View** — Maps out your AWS Organization structure from the Root level, through Organizational Units (OUs), down to individual Accounts.
- **Network View** — Visualizes your global networking layout, including Transit Gateways (TGWs), VPCs, subnet boundaries classified by function (public, private, TGW, firewall), NAT Gateways, Internet Gateways (IGWs), Load Balancers, Network Firewalls, and Customer Gateways (CGWs).
- **Security, IAM, and Global Views** — Renders service logging and protections (Macie, GuardDuty, Security Hub, Config, CloudTrail) and IAM components.

### 2. Advanced Layout & Interactivity
- **VPC Peering Connections** — Automatically parses `vpcPeering` configurations from `network-config.yaml` and draws peering links as blue dashed lines between VPC side handles.
- **Smart Resource Aggregation (CloudFormation Stacks)** — Groups duplicate or redundant customizations/stacks into a single `CloudFormation Stacks (N)` node. Clicking the node opens a searchable modal panel containing regions, types (Stack vs. StackSet), descriptions, and full parameter listings (safely serializing complex configurations).
- **SSO Assignment Details Modal** — Displays comprehensive AWS IAM Identity Center group permissions inside a searchable and sortable table for any selected Account or OU, resolving both direct and inherited assignments dynamically.
- **Focus Selection (Solo Mode)** — Selecting a node automatically highlights its direct connections and dims the rest of the canvas. This behavior can be toggled on/off in the **Diagram Tools** sidebar.
- **Semantic Zoom (LOD)** — Smoothly fades out subnets, service nodes, and connection lines when zooming out below 50% scale, leaving only high-level boundary boxes (OUs, Accounts, VPCs) visible to prevent screen clutter.

### 3. High-Fidelity Exports
- **Vector Images (SVG/PDF)** — Export high-resolution vector representations of your diagram for documentation and printing (configured for A3 landscape).
- **Draw.io Vector Exporting** — Generates `.drawio` XML files with fully matching AWS 4 stencils:
  - Resource labels are placed below stencils to prevent text boxes from masking the icons.
  - Subnet containers are mapped to correct stencil boundaries (`group_subnet_public` and `group_subnet_private`).
  - Containers (VPCs, OUs, Accounts, Subnets) place headers in the top-left corner using official AWS spacing parameters.
  - Route tables are mapped to official AWS Route Table stencils.

---

## Getting Started

### Prerequisites
- Node.js 18 or later
- npm

### Install & Run Locally

To run the application locally on your machine in development mode:

```bash
# 1. Clone the repository
git clone https://github.com/alun-hub/aws-archview.git
cd aws-archview

# 2. Install dependencies
npm install

# 3. Start the hot-reloading development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your web browser.

### Build & Run Standalone Desktop App (Linux)

You can package and run AWS ArchView as a standalone desktop application using Electron:

```bash
# 1. Package the AppImage
npm run electron:build

# 2. Make it executable
chmod +x dist-desktop/AWS\ ArchView-0.1.12.AppImage

# 3. Run the application standalone
./dist-desktop/AWS\ ArchView-0.1.12.AppImage
```

---

## Using the Application

### 1. Load Configurations
Drag and drop your LZA YAML configuration files directly onto the **Configuration** panel in the left sidebar. The application auto-detects and loads them by name:

| Filename | Purpose |
|---|---|
| `organization-config.yaml` | Defines OUs, root, and SCP attachments. |
| `accounts-config.yaml` | Defines workload account and mandatory account hierarchies. |
| `network-config.yaml` | Defines VPCs, subnets, TGWs, CGWs, VPNs, and VPC peerings. |
| `security-config.yaml` | Maps central security logging and protection policies. |
| `iam-config.yaml` | Defines permission sets and Identity Center assignments. |
| `global-config.yaml` | Defines global parameters, regions, and baseline setups. |
| `customizations-config.yaml` | Defines custom CloudFormation templates and customizations. |

### 2. Try the Samples
The repository includes test configs you can drag-and-drop to try out the visualizer:
- **`samples/`**: A minimal set of configurations covering all basic views.
- **`samples-adv/`**: A richer enterprise configuration demonstrating advanced networks (Transit Gateways, route tables, VPNs, and VPC Peerings).

---

## Shortcuts

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open search bar to search for nodes by name/ID |
| `F` | Auto-fit the canvas view to frame all nodes |
| `Esc` | Clear node selection and close details panel |

---

## Deployment & Production Running

Since AWS ArchView builds into a static Single Page Application (SPA), it does not require a Node.js backend in production and can be served by any static web server or CDN.

### Build Production Assets
Generate optimized static assets in the `dist/` directory:
```bash
npm run build
```

### Options for Deployment

#### A. AWS Static Hosting (S3 + CloudFront)
1. Run `npm run build` to generate the production assets locally (note that the compiled `dist/` directory is git-ignored and will not be present in the repository until you build it).
2. Upload all the files inside the newly generated `dist/` folder to an Amazon S3 bucket configured for static website hosting.
3. Front the S3 bucket with an Amazon CloudFront distribution to serve it securely over HTTPS.

#### B. Cloud Static Providers
Connect your Git repository directly to modern hosting providers such as:
- **GitHub Pages**
- **Cloudflare Pages**
- **Vercel**
- **Netlify**
Configure `npm run build` as the build command and `dist` as the output directory.

#### C. Docker Container
Run the application in a lightweight Nginx container. Build the image using the provided multi-stage build:

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run the container locally:
```bash
docker build -t aws-archview .
docker run -p 8080:80 aws-archview
```
Open [http://localhost:8080](http://localhost:8080).

---

## License

MIT
