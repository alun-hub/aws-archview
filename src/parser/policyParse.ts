// Parses an IAM-style JSON policy document (the shape used by SCPs, tagging/
// backup policy targets, and account-level IAM policies alike) into a flat
// list of statements. Shaped as {name, ...primitives} so it flows straight
// through the generic named-object array renderer in DetailPanel (the same
// one used for e.g. Direct Connect virtual interfaces) — no bespoke table
// needed on the UI side.
export interface PolicyStatementEntry {
  name: string
  effect: string
  action: string
  resource: string
}

export function parsePolicyStatements(policyName: string, jsonContent: string): PolicyStatementEntry[] {
  try {
    const doc = JSON.parse(jsonContent) as { Statement?: unknown }
    const raw = doc?.Statement
    const statements = Array.isArray(raw) ? raw : raw ? [raw] : []
    const fmt = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v != null ? String(v) : '*')
    return statements.map((s) => {
      const stmt = (s ?? {}) as Record<string, unknown>
      const action = stmt.NotAction != null ? `NOT ${fmt(stmt.NotAction)}` : fmt(stmt.Action)
      const resource = stmt.NotResource != null ? `NOT ${fmt(stmt.NotResource)}` : fmt(stmt.Resource)
      const sid = typeof stmt.Sid === 'string' ? ` [${stmt.Sid}]` : ''
      return {
        name: `${policyName}${sid}`,
        effect: typeof stmt.Effect === 'string' ? stmt.Effect : '',
        action,
        resource,
      }
    })
  } catch {
    return []
  }
}
