import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import type { Edge, Node } from '@xyflow/react'

// ── Shared DOM filter: exclude UI chrome + grid from captures ───────────────
const EXCLUDE = ['react-flow__controls', 'react-flow__minimap', 'export-menu-panel', 'react-flow__background', 'react-flow__panel']
const captureFilter = (node: Element) => !EXCLUDE.some((c) => node.classList?.contains(c))

function getFlowEl(): HTMLElement | null {
  return document.querySelector('.react-flow')
}

async function capturePng(el: HTMLElement): Promise<string> {
  return toPng(el, { backgroundColor: '#ffffff', pixelRatio: 4, filter: captureFilter })
}

// ── PNG ──────────────────────────────────────────────────────────────────────
export async function exportToPng(label = 'archview'): Promise<void> {
  const el = getFlowEl()
  if (!el) return
  download(await capturePng(el), `${label}.png`)
}

// ── SVG — embed PNG as <image> so all SVG viewers render it correctly ────────
// html-to-image's toSvg() doesn't handle ReactFlow's CSS transforms reliably.
export async function exportToSvg(label = 'archview'): Promise<void> {
  const el = getFlowEl()
  if (!el) return
  const dataUrl = await capturePng(el)
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `  <image href="${dataUrl}" width="${w}" height="${h}"/>`,
    '</svg>',
  ].join('\n')
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  download(URL.createObjectURL(blob), `${label}.svg`)
}

// ── PDF (A3 Landscape) ───────────────────────────────────────────────────────
export async function exportToPdf(label = 'archview'): Promise<void> {
  const el = getFlowEl()
  if (!el) return
  const url = await capturePng(el)

  const img = await loadImage(url)
  const A3_W_MM = 420
  const A3_H_MM = 297
  const ratio = Math.min(A3_W_MM / img.naturalWidth, A3_H_MM / img.naturalHeight)
  const wMm = img.naturalWidth  * ratio
  const hMm = img.naturalHeight * ratio
  const xMm = (A3_W_MM - wMm) / 2
  const yMm = (A3_H_MM - hMm) / 2

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  pdf.addImage(url, 'PNG', xMm, yMm, wMm, hMm)
  pdf.save(`${label}.pdf`)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload  = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

// ── draw.io XML ──────────────────────────────────────────────────────────────

const DRAWIO_CONTAINER_STYLE: Record<string, string> = {
  root:            'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_aws_cloud_alt;strokeColor=#232F3E;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
  ou:              'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_organizational_unit;strokeColor=#E7157B;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
  account:         'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_account;strokeColor=#FF9900;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
  region:          'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_region;strokeColor=#4A90D9;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
  'on-premises':   'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_corporate_data_center;strokeColor=#5A5A5A;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1;dashed=1',
  vpc:             'points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#8C4FFF;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
  'subnet-public':  'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet_public;strokeColor=#248814;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=10;dashed=1',
  'subnet-private': 'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet_private;strokeColor=#1A6CAE;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=10;dashed=1',
  'subnet-firewall':'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security;strokeColor=#CC3300;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=10;dashed=1',
  'subnet-tgw':     'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet_private;strokeColor=#6B3FA0;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=10;dashed=1',
  'tgw-rt-group':   'shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#6B3FA0;fillColor=none;verticalAlign=top;align=left;spacingLeft=30;fontSize=11;fontStyle=1',
}

const DRAWIO_RESOURCE_STYLE: Record<string, string> = {
  // Networking
  tgw:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#8C4FFF;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.transit_gateway;verticalLabelPosition=bottom;verticalAlign=top;',
  'tgw-rt':         'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#8C4FFF;align=center;html=1;fontSize=11;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_table;verticalLabelPosition=bottom;verticalAlign=top;',
  vpn:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#CC7700;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.site_to_site_vpn;verticalLabelPosition=bottom;verticalAlign=top;',
  cgw:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#CC7700;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.customer_gateway;verticalLabelPosition=bottom;verticalAlign=top;',
  igw:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.internet_gateway;verticalLabelPosition=bottom;verticalAlign=top;',
  'nat-gateway':    'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.nat_gateway;verticalLabelPosition=bottom;verticalAlign=top;',
  'network-firewall':'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#CC3300;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.network_firewall;verticalLabelPosition=bottom;verticalAlign=top;',
  nlb:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;verticalLabelPosition=bottom;verticalAlign=top;',
  alb:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elastic_load_balancing;verticalLabelPosition=bottom;verticalAlign=top;',
  dx:               'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#5A5A5A;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.direct_connect;verticalLabelPosition=bottom;verticalAlign=top;',
  'client-vpn':     'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#CC7700;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.client_vpn;verticalLabelPosition=bottom;verticalAlign=top;',
  route53:          'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;verticalLabelPosition=bottom;verticalAlign=top;',
  cloud:            'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#007DB8;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloud;verticalLabelPosition=bottom;verticalAlign=top;',

  // Management & Governance
  organizations:    'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.organizations;verticalLabelPosition=bottom;verticalAlign=top;',
  'control-tower':  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.control_tower;verticalLabelPosition=bottom;verticalAlign=top;',
  cloudtrail:       'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudtrail;verticalLabelPosition=bottom;verticalAlign=top;',
  config:           'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.config;verticalLabelPosition=bottom;verticalAlign=top;',
  cloudformation:   'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudformation;verticalLabelPosition=bottom;verticalAlign=top;',
  'systems-manager': 'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#FF9900;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.systems_manager;verticalLabelPosition=bottom;verticalAlign=top;',
  'service-catalog':'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#FF9900;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.service_catalog;verticalLabelPosition=bottom;verticalAlign=top;',
  cloudwatch:       'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudwatch;verticalLabelPosition=bottom;verticalAlign=top;',
  backup:           'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.backup;verticalLabelPosition=bottom;verticalAlign=top;',

  // Security & Identity
  'security-hub':   'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.security_hub;verticalLabelPosition=bottom;verticalAlign=top;',
  guardduty:        'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.guardduty;verticalLabelPosition=bottom;verticalAlign=top;',
  inspector:        'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.inspector;verticalLabelPosition=bottom;verticalAlign=top;',
  macie:            'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.macie;verticalLabelPosition=bottom;verticalAlign=top;',
  iam:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.role;verticalLabelPosition=bottom;verticalAlign=top;',
  'iam-core':       'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.role;verticalLabelPosition=bottom;verticalAlign=top;',
  detective:        'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.detective;verticalLabelPosition=bottom;verticalAlign=top;',
  'audit-manager':  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.audit_manager;verticalLabelPosition=bottom;verticalAlign=top;',
  acm:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.certificate_manager;verticalLabelPosition=bottom;verticalAlign=top;',
  kms:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.key_management_service;verticalLabelPosition=bottom;verticalAlign=top;',
  'firewall-manager':'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.firewall_manager;verticalLabelPosition=bottom;verticalAlign=top;',
  'directory-service':'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.directory_service;verticalLabelPosition=bottom;verticalAlign=top;',
  'security-lake':  'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.security_lake;verticalLabelPosition=bottom;verticalAlign=top;',
  scp:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#DD3B25;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.organizations;verticalLabelPosition=bottom;verticalAlign=top;',

  // Storage
  s3:               'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#7AA116;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;verticalLabelPosition=bottom;verticalAlign=top;',

  // Compute
  lambda:           'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#FF9900;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;verticalLabelPosition=bottom;verticalAlign=top;',
  ec2:              'outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#FF9900;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;verticalLabelPosition=bottom;verticalAlign=top;',
}

const DRAWIO_EDGE_STYLE: Record<string, string> = {
  tgw:         'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#6B3FA0;strokeWidth=2;dashed=1;dashPattern=8 4;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;',
  'tgw-hub':   'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#6B3FA0;strokeWidth=2;dashed=1;dashPattern=8 4;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;',
  vpn:         'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#CC7700;strokeWidth=2;dashed=1;dashPattern=6 4;',
  peering:     'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#1A6CAE;strokeWidth=2;dashed=1;dashPattern=5 3;',
  flow:        'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#248814;strokeWidth=2;',
  default:     'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;strokeColor=#6B3FA0;strokeWidth=2;',
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function exportToDrawio(nodes: Node[], edges: Edge[], label = 'archview'): void {
  // Nodes are ordered parents-first so draw.io renders containers correctly
  const nodeCells = nodes.map((n) => {
    const kind      = (n.data as { kind?: string })?.kind ?? ''
    const nodeLabel = (n.data as { label?: string })?.label ?? n.id
    const x         = Math.round(n.position.x)
    const y         = Math.round(n.position.y)
    const w         = Math.round((n.width  ?? 100) as number)
    const h         = Math.round((n.height ?? 60)  as number)
    const parent    = n.parentId ?? '1'

    const containerStyle = DRAWIO_CONTAINER_STYLE[kind]
    const resourceStyle  = DRAWIO_RESOURCE_STYLE[kind]
    const style = containerStyle ?? resourceStyle
      ?? 'rounded=1;whiteSpace=wrap;html=1;fontSize=11;'

    return `    <mxCell id="${escapeXml(n.id)}" value="${escapeXml(nodeLabel)}" style="${style}" vertex="1" parent="${escapeXml(parent)}">
      <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
    </mxCell>`
  })

  let edgeCounter = 0
  const edgeCells = edges.map((e) => {
    const kind  = (e as { kind?: string })?.kind ?? 'default'
    const style = DRAWIO_EDGE_STYLE[kind] ?? DRAWIO_EDGE_STYLE.default
    const lbl   = e.label ? ` label="${escapeXml(String(e.label))}"` : ''
    const id    = `edge-${++edgeCounter}`
    return `    <mxCell id="${id}"${lbl} style="${style}" edge="1" source="${escapeXml(e.source)}" target="${escapeXml(e.target)}" parent="1">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>`
  })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile version="21.0.0" type="device">
  <diagram name="${escapeXml(label)}" id="aws-archview">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${nodeCells.join('\n')}
${edgeCells.join('\n')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

  const blob = new Blob([xml], { type: 'application/xml' })
  download(URL.createObjectURL(blob), `${label}.drawio`)
}

// ── Helper ───────────────────────────────────────────────────────────────────
function download(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
