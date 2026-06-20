// Official AWS Architecture Icons — public/icons/aws/*.svg
// Sourced from the official AWS Architecture Icons package (aws.amazon.com/architecture/icons/)
// License: AWS Intellectual Property (see aws.amazon.com/terms/)

import type { CSSProperties } from 'react'

export type IconKind =
  // ── Boundary / group icons ───────────────────────────────────────────────
  | 'cloud' | 'root' | 'ou' | 'account' | 'management-account' | 'region' | 'on-premises'
  | 'vpc' | 'subnet-public' | 'subnet-private' | 'subnet-firewall' | 'subnet-tgw'
  | 'tgw-rt-group'
  // ── Networking ────────────────────────────────────────────────────────────
  | 'tgw' | 'tgw-rt' | 'vpn' | 'cgw' | 'client-vpn' | 'dx' | 'route53' | 'nlb' | 'alb'
  | 'network-firewall' | 'igw' | 'nat-gateway'
  // ── Management & Governance ───────────────────────────────────────────────
  | 'organizations' | 'control-tower' | 'cloudtrail' | 'config' | 'cloudformation'
  | 'systems-manager' | 'service-catalog' | 'cloudwatch' | 'backup'
  // ── Security & Identity ───────────────────────────────────────────────────
  | 'security-hub' | 'guardduty' | 'inspector' | 'macie' | 'iam' | 'iam-core'
  | 'detective' | 'audit-manager' | 'acm' | 'kms' | 'firewall-manager'
  | 'directory-service' | 'security-lake' | 'scp'
  // ── Storage ───────────────────────────────────────────────────────────────
  | 's3'
  // ── Compute ───────────────────────────────────────────────────────────────
  | 'lambda' | 'ec2'

// Every icon that has a downloaded SVG file
const SVG_MAP: Partial<Record<IconKind, string>> = {
  // Boundary
  root:                 'root.svg',
  ou:                   'ou.svg',
  account:              'account.svg',
  'management-account': 'management-account.svg',
  cloud:                'cloud.svg',
  region:               'region.svg',
  vpc:                  'vpc.svg',
  'subnet-public':      'subnet-public.svg',
  'subnet-private':     'subnet-private.svg',
  'subnet-firewall':    'network-firewall.svg',
  'subnet-tgw':         'tgw.svg',
  'on-premises':        'dx.svg',               // Direct Connect icon for on-prem
  // Networking
  tgw:                  'tgw.svg',
  'tgw-rt':             'tgw.svg',
  'tgw-rt-group':       'tgw.svg',
  vpn:                  'vpn.svg',
  igw:                  'igw.svg',
  cgw:                  'cgw.svg',
  'client-vpn':         'client-vpn.svg',
  dx:                   'dx.svg',
  route53:              'route53.svg',
  nlb:                  'nlb.svg',
  alb:                  'alb.svg',
  'network-firewall':   'network-firewall.svg',
  'nat-gateway':        'nat-gateway.svg',
  // Management
  organizations:        'organizations.svg',
  'control-tower':      'control-tower.svg',
  cloudtrail:           'cloudtrail.svg',
  config:               'config.svg',
  cloudformation:       'cloudformation.svg',
  'systems-manager':    'systems-manager.svg',
  'service-catalog':    'service-catalog.svg',
  cloudwatch:           'cloudwatch.svg',
  backup:               'backup.svg',
  // Security
  'security-hub':       'security-hub.svg',
  guardduty:            'guardduty.svg',
  inspector:            'inspector.svg',
  macie:                'macie.svg',
  iam:                  'iam.svg',
  'iam-core':           'iam-core.svg',
  detective:            'detective.svg',
  'audit-manager':      'audit-manager.svg',
  acm:                  'acm.svg',
  kms:                  'kms.svg',
  'firewall-manager':   'firewall-manager.svg',
  'directory-service':  'directory-service.svg',
  'security-lake':      'security-lake.svg',
  scp:                  'scp.svg',
  // Storage
  s3:                   's3.svg',
  // Compute
  lambda:               'lambda.svg',
  ec2:                  'ec2.svg',
}

interface Props {
  kind: IconKind
  size?: number
  style?: CSSProperties
}

export function AwsIcon({ kind, size = 32, style }: Props) {
  const path = SVG_MAP[kind]
  if (path) {
    return (
      <img
        src={`./icons/aws/${path}`}
        width={size}
        height={size}
        alt={kind}
        style={{ display: 'block', borderRadius: 6, flexShrink: 0, ...style }}
        draggable={false}
      />
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={style}>
      <rect width="32" height="32" rx="6" fill="#888" />
    </svg>
  )
}
