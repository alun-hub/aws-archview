// Parses an IAM-style JSON policy document (the shape used by SCPs, tagging/
// backup policy targets, and account-level IAM policies alike) into a flat
// list of statements. Shaped as {name, ...primitives} so it flows straight
// through the generic named-object array renderer in DetailPanel (the same
// one used for e.g. Direct Connect virtual interfaces) — no bespoke table
// needed on the UI side.
export interface PolicyStatementEntry {
  name: string
  /** The statement's own Sid, separate from the policy name. */
  sid: string
  effect: string
  action: string
  resource: string
  /**
   * The Condition block, flattened to `Operator key = value` clauses.
   *
   * Not optional detail: most SCPs are `Deny * on *` and mean something
   * entirely specific because of their condition. Rendering the first three
   * columns without this one says the policy denies everything for everyone,
   * which is both wrong and alarming.
   */
  condition: string
  /** Principal or NotPrincipal, which resource control policies rely on. */
  principal: string
}

/** `{ StringLike: { "aws:PrincipalArn": "arn:…" } }` →
 *  `StringLike aws:PrincipalArn = arn:…` */
function formatCondition(condition: unknown): string {
  if (condition == null || typeof condition !== 'object') return ''
  const clauses: string[] = []
  for (const [operator, keys] of Object.entries(condition as Record<string, unknown>)) {
    if (keys == null || typeof keys !== 'object') continue
    for (const [key, value] of Object.entries(keys as Record<string, unknown>)) {
      const v = Array.isArray(value) ? value.join(', ') : String(value)
      clauses.push(`${operator} ${key} = ${v}`)
    }
  }
  return clauses.join('; ')
}

export function parsePolicyStatements(policyName: string, jsonContent: string): PolicyStatementEntry[] {
  try {
    const doc = JSON.parse(jsonContent) as { Statement?: unknown }
    const raw = doc?.Statement
    const statements = Array.isArray(raw) ? raw : raw ? [raw] : []
    // `Principal` is often `{ AWS: "*" }` or `{ Service: [...] }` rather than a
    // string, and String() on that yields "[object Object]".
    const fmt = (v: unknown): string => {
      if (v == null) return '*'
      if (Array.isArray(v)) return v.map(fmt).join(', ')
      if (typeof v === 'object') {
        return Object.entries(v as Record<string, unknown>)
          .map(([k, val]) => `${k}: ${fmt(val)}`)
          .join(', ')
      }
      return String(v)
    }
    return statements.map((s) => {
      const stmt = (s ?? {}) as Record<string, unknown>
      const action = stmt.NotAction != null ? `NOT ${fmt(stmt.NotAction)}` : fmt(stmt.Action)
      const resource = stmt.NotResource != null ? `NOT ${fmt(stmt.NotResource)}` : fmt(stmt.Resource)
      const sid = typeof stmt.Sid === 'string' ? stmt.Sid : ''
      const principal = stmt.NotPrincipal != null
        ? `NOT ${fmt(stmt.NotPrincipal)}`
        : stmt.Principal != null ? fmt(stmt.Principal) : ''
      return {
        name: sid ? `${policyName} [${sid}]` : policyName,
        sid,
        effect: typeof stmt.Effect === 'string' ? stmt.Effect : '',
        action,
        resource,
        condition: formatCondition(stmt.Condition),
        principal,
      }
    })
  } catch {
    return []
  }
}
