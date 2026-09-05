// ─── Graph node id construction ───────────────────────────────────────────────
//
// Node ids are the contract between the parsers (which mint them) and everything
// that later points at a node — search, the detail panel, and the analysis rules
// that report a finding against a specific VPC or subnet. Keeping the templates
// here means a finding can name a node without re-deriving a string literal that
// a parser is free to change.

/** Accounts are keyed by their LZA config name, which is unique org-wide. */
export const accountNodeId = (account: string) => `account:${account}`

/** OUs are keyed by full path ("Infrastructure/Network") — two OUs in different
 *  branches may share a leaf name, so the path is what identifies one. */
export const ouNodeId = (ouPath: string) => `ou:${ouPath}`

export const regionNodeId = (account: string, region: string) => `region:${account}:${region}`

/** VPC names are only unique per account in practice, so the account is part
 *  of the id. */
export const vpcNodeId = (vpcName: string, account: string) => `vpc:${vpcName}:${account}`

export const subnetNodeId = (vpcName: string, account: string, subnetName: string) =>
  `subnet:${vpcNodeId(vpcName, account)}:${subnetName}`

export const tgwNodeId = (tgwName: string) => `tgw:${tgwName}`

export const tgwRouteTableNodeId = (routeTableName: string) => `tgw-rt:${routeTableName}`

export const vpnNodeId = (vpnName: string) => `vpn:${vpnName}`

export const cgwNodeId = (cgwName: string) => `cgw:${cgwName}`

export const dxNodeId = (dxgwName: string) => `dx:${dxgwName}`
