# AWS ArchView

AWS ArchView is an interactive, browser-based architecture visualizer for [AWS Landing Zone Accelerator (LZA)](https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/) configurations. Simply drag and drop your LZA configuration YAML files onto the canvas to map out and explore your organization structure and network topologies.

Because AWS ArchView is a pure client-side web application, **no server-side processing is performed, and your data never leaves your browser**.

---

## Key Features

- **Interactive Diagrams** — Pan, zoom, search, select, and filter nodes dynamically.
- **Organization View** — Renders your AWS Organization structure: Root, Organizational Units (OUs), Accounts, Service Control Policies (SCPs), security configurations (Macie, GuardDuty, Config, Security Hub, CloudTrail), and AWS IAM Identity Center SSO assignments.
- **VPC Peering Visualization** — Automatically parses `vpcPeering` configurations from `network-config.yaml` and visualizes peering connections as blue dashed lines between VPC side handles.
- **SSO Assignments details Modal** — View detailed AWS IAM Identity Center group permissions inside a searchable and sortable Cloudscape Modal Table for any Account or OU, resolving both direct and inherited assignments dynamically.
- **Network View** — Renders network topology: VPCs, subnets classified by function (public, private, TGW, firewall), Transit Gateways (TGWs), NAT Gateways, Load Balancers, Network Firewalls, and VPN connections.
- **Dynamic Connection Filters** — Toggle layers in the sidebar to show or hide TGW attachments, TGW route table propagations, VPN connections, and internet flows.
- **Legend & Shortcuts** — Easily identify edge types and navigate using keybindings (e.g. `⌘K` / `Ctrl+K` to search nodes, `F` to auto-fit view, `Esc` to deselect).

---

## Getting Started

### Prerequisites
- Node.js 18 or later
- npm

### Install & Run Locally

To run the application locally on your machine:

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

---

## Using the Application

### 1. Load Configurations
Drag and drop your LZA YAML configuration files directly onto the **Configuration** panel on the left. The application auto-detects and loads them by name:

| Filename | Purpose |
|---|---|
| `organization-config.yaml` | Defines OUs, root, and SCP attachments. |
| `accounts-config.yaml` | Defines mandatory and workload account hierarchies. |
| `network-config.yaml` | Defines VPCs, subnets, TGWs, CGWs, VPNs, and VPC peerings. |
| `security-config.yaml` | Maps central security logging and protection policies. |
| `iam-config.yaml` | Defines permission sets and Identity Center assignments. |

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
1. Upload the files in `dist/` to an Amazon S3 bucket configured for static website hosting.
2. Front the bucket with an Amazon CloudFront distribution to serve it securely over HTTPS.

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
