import { useMemo, useState } from 'react'
import type { AccountProfile, Finding, ProfileLink, ProfileSubnet } from '../../analysis'
import type { PolicyStatementEntry } from '../../parser/policyParse'
import { SEVERITY_COLOR } from '../canvas/severityStyle'
import { SeverityDot } from './ValidationPanel'

const FONT = '"Amazon Ember", "Helvetica Neue", Arial, sans-serif'

interface Props {
  profiles: AccountProfile[]
  selected: string | null
  onSelectAccount(name: string | null): void
  /** Jump to a node on another view — the whole point of the profile is that
   *  every fact on it leads back to where it lives. */
  onFocus(link: ProfileLink): void
  onSelectFinding(finding: Finding): void
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
        color: '#5f6b7a', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e9ebed',
      }}>
        {title}
        {count != null && <span style={{ color: '#aab', fontWeight: 400 }}> · {count}</span>}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: '#999', fontStyle: 'italic' }}>{children}</div>
}

/** Where an attachment comes from: named outright, or inherited from an OU. */
function SourceTag({ source }: { source: string }) {
  const direct = source === 'direct'
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 10, whiteSpace: 'nowrap',
      background: direct ? 'rgba(0,115,187,0.10)' : '#f2f3f3',
      color: direct ? '#0073bb' : '#5f6b7a',
      border: `1px solid ${direct ? 'rgba(0,115,187,0.25)' : '#e0e2e3'}`,
    }}>
      {direct ? 'direct' : `inherited from ${source}`}
    </span>
  )
}

function LinkRow({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const interactive = onClick != null
  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!() } } : undefined}
      title={interactive ? 'Show on the diagram' : undefined}
      style={{
        padding: '7px 9px',
        borderRadius: 5,
        border: '1px solid #e9ebed',
        marginBottom: 5,
        cursor: interactive ? 'pointer' : 'default',
        background: '#fff',
        fontFamily: FONT,
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.background = '#f7f8f8' } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.background = '#fff' } : undefined}
    >
      {children}
    </div>
  )
}

/**
 * A row that opens to show what it is actually made of.
 *
 * Knowing that "SCP-DenyRootAccess" is attached is the start of the question,
 * not the answer — the row's `detail` carries the statements, subnets or
 * parameters behind the name. Rows with nothing to show stay plain, so a
 * chevron always means there is something under it.
 */
function ExpandableRow({ summary, detail, onFocus }: {
  summary: React.ReactNode
  detail?: React.ReactNode
  onFocus?: () => void
}) {
  const [open, setOpen] = useState(false)
  const expandable = detail != null

  return (
    <div
      style={{
        borderRadius: 5,
        border: '1px solid #e9ebed',
        marginBottom: 5,
        background: '#fff',
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px' }}>
        {expandable ? (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Hide details' : 'Show details'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0 0',
              fontSize: 9, color: '#888', lineHeight: 1, flexShrink: 0, width: 10,
            }}
          >
            {open ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <div
          onClick={expandable ? () => setOpen((v) => !v) : onFocus}
          role={expandable || onFocus ? 'button' : undefined}
          tabIndex={expandable || onFocus ? 0 : undefined}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            if (expandable) setOpen((v) => !v)
            else onFocus?.()
          }}
          style={{ flex: 1, minWidth: 0, cursor: expandable || onFocus ? 'pointer' : 'default' }}
        >
          {summary}
        </div>
        {onFocus && (
          <button
            onClick={(e) => { e.stopPropagation(); onFocus() }}
            title="Show on the diagram"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: '#0073bb', fontSize: 12, flexShrink: 0,
            }}
          >
            ↗
          </button>
        )}
      </div>
      {expandable && open && (
        <div style={{ padding: '0 9px 9px 27px', borderTop: '1px solid #f2f3f3', paddingTop: 8 }}>
          {detail}
        </div>
      )}
    </div>
  )
}

/** Key/value lines used inside an expanded row. */
function DetailLines({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <span style={{ color: '#8b95a1', minWidth: 96, flexShrink: 0 }}>{k}</span>
          <span style={{ color: '#414d5c', wordBreak: 'break-word' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '3px 6px', fontSize: 11, textAlign: 'left', verticalAlign: 'top',
  borderBottom: '1px solid #f2f3f3', color: '#414d5c', wordBreak: 'break-word',
}
const headStyle: React.CSSProperties = { ...cellStyle, color: '#8b95a1', fontWeight: 600 }

/** The statements a policy document actually contains — the answer to "what
 *  does this SCP deny?", which the policy's name only hints at. */
function StatementTable({ statements }: { statements: PolicyStatementEntry[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 340 }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, width: 70 }}>Effect</th>
            <th style={headStyle}>Action</th>
            <th style={headStyle}>Resource</th>
          </tr>
        </thead>
        <tbody>
          {statements.map((st, i) => (
            <tr key={`${st.name}:${i}`}>
              <td style={{ ...cellStyle, color: st.effect === 'Deny' ? '#d13212' : '#248814', fontWeight: 700 }}>
                {st.effect || '—'}
              </td>
              <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{st.action}</td>
              <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{st.resource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubnetTable({ subnets }: { subnets: ProfileSubnet[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 340 }}>
        <thead>
          <tr>
            <th style={headStyle}>Subnet</th>
            <th style={{ ...headStyle, width: 120 }}>CIDR</th>
            <th style={{ ...headStyle, width: 40 }}>AZ</th>
            <th style={headStyle}>Route table</th>
          </tr>
        </thead>
        <tbody>
          {subnets.map((sub) => (
            <tr key={sub.name}>
              <td style={cellStyle}>{sub.name}</td>
              <td style={{ ...cellStyle, fontFamily: 'monospace' }}>{sub.cidr ?? '—'}</td>
              <td style={cellStyle}>{sub.availabilityZone ?? '—'}</td>
              <td style={cellStyle}>{sub.routeTable ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const chipStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  background: '#f2f3f3', border: '1px solid #e0e2e3', color: '#414d5c',
}

function Chips({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {items.map((i) => <span key={i} style={chipStyle}>{i}</span>)}
    </div>
  )
}

// ── The profile itself ───────────────────────────────────────────────────────

function ProfileCard({ profile, onFocus, onSelectFinding, onBack }: {
  profile: AccountProfile
  onFocus(link: ProfileLink): void
  onSelectFinding(finding: Finding): void
  onBack(): void
}) {
  const worst = profile.findings.some((f) => f.severity === 'error') ? 'error'
    : profile.findings.some((f) => f.severity === 'warning') ? 'warning'
    : 'info'

  return (
    <div style={{ padding: '4px 24px 32px', fontFamily: FONT, maxWidth: 900 }}>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', padding: 0, marginBottom: 14,
          color: '#0073bb', cursor: 'pointer', fontSize: 12, fontFamily: FONT,
        }}
      >
        ← All accounts
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 22, color: '#232F3E' }}>{profile.name}</h2>
          <span
            onClick={() => onFocus(profile.link)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onFocus(profile.link) }}
            title="Show this account in the Organization view"
            style={{ fontSize: 12, color: '#0073bb', cursor: 'pointer' }}
          >
            {profile.ouPath} ↗
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#5f6b7a', marginTop: 4, fontFamily: 'monospace' }}>{profile.email}</div>
        {profile.description && (
          <div style={{ fontSize: 12, color: '#5f6b7a', marginTop: 4 }}>{profile.description}</div>
        )}
      </div>

      {profile.findings.length > 0 && (
        <Section title="Validation" count={profile.findings.length}>
          <div style={{
            border: `1px solid ${SEVERITY_COLOR[worst]}44`,
            borderRadius: 6, padding: 4, background: `${SEVERITY_COLOR[worst]}0a`,
          }}>
            {profile.findings.map((f) => (
              <div
                key={f.id}
                onClick={() => onSelectFinding(f)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectFinding(f) }}
                style={{ display: 'flex', gap: 8, padding: '6px 8px', cursor: 'pointer', alignItems: 'flex-start' }}
              >
                <span style={{ marginTop: 1 }}><SeverityDot severity={f.severity} size={13} /></span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{f.title}</div>
                  <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>{f.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Policies" count={profile.policies.length}>
        {profile.policies.length === 0 ? (
          <Empty>No service control, tagging or backup policy reaches this account.</Empty>
        ) : (
          profile.policies.map((p) => (
            <ExpandableRow
              key={`${p.type}:${p.name}`}
              summary={
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>
                      {p.name}
                      <span style={{ fontWeight: 400, color: '#8b95a1', marginLeft: 8, fontSize: 11 }}>
                        {p.type.toUpperCase()}
                      </span>
                    </span>
                    <SourceTag source={p.source} />
                  </div>
                  {p.description && (
                    <div style={{ fontSize: 11, color: '#5f6b7a', marginTop: 3 }}>{p.description}</div>
                  )}
                </>
              }
              detail={p.statements?.length || p.policyFile ? (
                <>
                  {p.policyFile && (
                    <div style={{ fontSize: 10, color: '#8b95a1', fontFamily: 'monospace', marginBottom: 6 }}>
                      {p.policyFile}
                    </div>
                  )}
                  {p.statements?.length ? (
                    <StatementTable statements={p.statements} />
                  ) : (
                    <Empty>Load {p.policyFile} to see what this policy contains.</Empty>
                  )}
                </>
              ) : undefined}
            />
          ))
        )}
      </Section>

      <Section title="Network" count={profile.vpcs.length}>
        {profile.vpcs.length === 0 ? (
          <Empty>This account owns no VPCs.</Empty>
        ) : (
          profile.vpcs.map((v) => (
            <ExpandableRow
              key={`${v.name}:${v.region}`}
              onFocus={() => onFocus(v.link)}
              summary={
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#232F3E' }}>{v.name}</span>
                    <span style={{ fontSize: 11, color: '#5f6b7a', fontFamily: 'monospace' }}>
                      {v.cidrs.join(', ') || '—'} · {v.region}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#5f6b7a', marginTop: 3 }}>
                    {v.subnets.length} subnet{v.subnets.length === 1 ? '' : 's'}
                    {v.availabilityZones.length > 0 && ` across ${v.availabilityZones.length} AZ (${v.availabilityZones.join(', ')})`}
                    {v.fromTemplate && ` · from template ${v.fromTemplate}`}
                  </div>
                  {v.attachments.map((a) => (
                    <div key={a.name} style={{ fontSize: 11, color: '#5f6b7a', marginTop: 3, paddingLeft: 10 }}>
                      ↳ TGW <strong>{a.tgw ?? '—'}</strong>
                      {a.associations.length > 0 && ` · associates ${a.associations.join(', ')}`}
                      {a.propagations.length > 0
                        ? ` · propagates ${a.propagations.join(', ')}`
                        : <span style={{ color: '#b7791f' }}> · propagates nowhere</span>}
                    </div>
                  ))}
                </>
              }
              detail={v.subnets.length > 0 ? <SubnetTable subnets={v.subnets} /> : undefined}
            />
          ))
        )}
      </Section>

      {profile.sharedSubnets.length > 0 && (
        <Section title="Shared subnets" count={profile.sharedSubnets.length}>
          {profile.sharedSubnets.map((s) => (
            <LinkRow key={`${s.vpc}:${s.subnet}`} onClick={() => onFocus(s.link)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#232F3E' }}>
                  <strong>{s.subnet}</strong>
                  <span style={{ color: '#8b95a1' }}> in {s.vpc}, owned by {s.ownerAccount}</span>
                </span>
                <SourceTag source={s.via} />
              </div>
              {s.cidr && <div style={{ fontSize: 11, color: '#5f6b7a', fontFamily: 'monospace', marginTop: 3 }}>{s.cidr}</div>}
            </LinkRow>
          ))}
        </Section>
      )}

      <Section title="IAM">
        {profile.iam.roles.length === 0 && profile.iam.groups.length === 0 && profile.iam.users.length === 0
          && profile.iam.policies.length === 0 && profile.iam.ssoAssignments.length === 0 ? (
          <Empty>No IAM sets or Identity Center assignments reach this account.</Empty>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {([
              ['Roles', profile.iam.roles],
              ['Groups', profile.iam.groups],
              ['Users', profile.iam.users],
            ] as const).filter(([, items]) => items.length > 0).map(([label, items]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 4 }}>{label}</div>
                {items.map((item) => {
                  const rows: [string, React.ReactNode][] = []
                  if (item.awsManagedPolicies) rows.push(['AWS managed', <Chips items={item.awsManagedPolicies} />])
                  if (item.customerManagedPolicies) rows.push(['Customer managed', <Chips items={item.customerManagedPolicies} />])
                  if (item.boundaryPolicy) rows.push(['Permissions boundary', item.boundaryPolicy])
                  if (item.group) rows.push(['Group', item.group])
                  return (
                    <ExpandableRow
                      key={item.name}
                      summary={<span style={{ fontSize: 12, color: '#232F3E' }}>{item.name}</span>}
                      detail={rows.length > 0 ? <DetailLines rows={rows} /> : undefined}
                    />
                  )
                })}
              </div>
            ))}
            {profile.iam.policies.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 4 }}>Customer-managed policies</div>
                {profile.iam.policies.map((p) => (
                  <ExpandableRow
                    key={p.name}
                    summary={<span style={{ fontSize: 12, color: '#232F3E' }}>{p.name}</span>}
                    detail={p.statements?.length || p.policyFile ? (
                      <>
                        {p.policyFile && (
                          <div style={{ fontSize: 10, color: '#8b95a1', fontFamily: 'monospace', marginBottom: 6 }}>
                            {p.policyFile}
                          </div>
                        )}
                        {p.statements?.length
                          ? <StatementTable statements={p.statements} />
                          : <Empty>Load {p.policyFile} to see what this policy contains.</Empty>}
                      </>
                    ) : undefined}
                  />
                ))}
              </div>
            )}
            {profile.iam.ssoAssignments.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 4 }}>Identity Center</div>
                {profile.iam.ssoAssignments.map((a) => (
                  <div key={`${a.principal}:${a.permissionSet}`} style={{ fontSize: 12, color: '#414d5c', marginBottom: 2 }}>
                    {a.principalType === 'GROUP' ? 'Group' : 'User'} <strong>{a.principal}</strong>
                    {' → '}{a.permissionSet}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Deployed into this account" count={profile.deployables.length + profile.backupVaults.length}>
        {profile.deployables.length === 0 && profile.backupVaults.length === 0 ? (
          <Empty>No customizations or backup vaults target this account.</Empty>
        ) : (
          <>
            {profile.deployables.map((d) => {
              const rows: [string, React.ReactNode][] = []
              if (d.description) rows.push(['Description', d.description])
              if (d.template) rows.push(['Template', <code style={{ fontSize: 10 }}>{d.template}</code>])
              if (d.regions?.length) rows.push(['Regions', d.regions.join(', ')])
              if (d.terminationProtection != null) {
                rows.push(['Termination protection', d.terminationProtection ? 'On' : 'Off'])
              }
              if (d.parameters?.length) {
                rows.push(['Parameters', (
                  <Chips items={d.parameters.map((param) => `${param.name}: ${param.value}`)} />
                )])
              }
              return (
                <ExpandableRow
                  key={`${d.kind}:${d.name}`}
                  summary={
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#232F3E' }}>
                        <strong>{d.name}</strong>
                        <span style={{ color: '#8b95a1', marginLeft: 8, fontSize: 11 }}>{d.kind}</span>
                      </span>
                      <SourceTag source={d.via} />
                    </div>
                  }
                  detail={rows.length > 0 ? <DetailLines rows={rows} /> : undefined}
                />
              )
            })}
            {profile.backupVaults.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#8b95a1', marginBottom: 4 }}>Backup vaults</div>
                <Chips items={profile.backupVaults} />
              </div>
            )}
          </>
        )}
      </Section>

      {profile.tags && Object.keys(profile.tags).length > 0 && (
        <Section title="Tags">
          <Chips items={Object.entries(profile.tags).map(([k, v]) => `${k}: ${v}`)} />
        </Section>
      )}
    </div>
  )
}

// ── The list ─────────────────────────────────────────────────────────────────

function AccountList({ profiles, onSelectAccount }: {
  profiles: AccountProfile[]
  onSelectAccount(name: string): void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  // Search covers the OU path and email too: "who is in Production?" and
  // "whose account is this address?" are both things people arrive with.
  const matches = useMemo(() => {
    if (!q) return profiles
    return profiles.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.ouPath.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q))
  }, [profiles, q])

  return (
    <div style={{ padding: '4px 24px 32px', fontFamily: FONT, maxWidth: 900 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by account, OU or email…"
        autoFocus
        style={{
          width: '100%', maxWidth: 380, padding: '7px 10px', marginBottom: 14,
          fontSize: 13, border: '1px solid #d5dbdb', borderRadius: 4,
          boxSizing: 'border-box', fontFamily: FONT,
        }}
      />

      {matches.length === 0 ? (
        <Empty>No account matches "{query}".</Empty>
      ) : (
        matches.map((p) => {
          const errors = p.findings.filter((f) => f.severity === 'error').length
          const warnings = p.findings.filter((f) => f.severity === 'warning').length
          return (
            <LinkRow key={p.name} onClick={() => onSelectAccount(p.name)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#232F3E' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#8b95a1', marginTop: 2 }}>{p.ouPath}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: '#5f6b7a' }}>
                  {p.vpcs.length > 0 && <span>{p.vpcs.length} VPC{p.vpcs.length === 1 ? '' : 's'}</span>}
                  {p.policies.length > 0 && <span>{p.policies.length} polic{p.policies.length === 1 ? 'y' : 'ies'}</span>}
                  {errors > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <SeverityDot severity="error" size={11} />{errors}
                    </span>
                  )}
                  {warnings > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <SeverityDot severity="warning" size={11} />{warnings}
                    </span>
                  )}
                </div>
              </div>
            </LinkRow>
          )
        })
      )}
    </div>
  )
}

export function AccountProfileView({ profiles, selected, onSelectAccount, onFocus, onSelectFinding }: Props) {
  if (profiles.length === 0) {
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: '#5f6b7a', fontSize: 13 }}>
        Load <code>accounts-config.yaml</code> and <code>organization-config.yaml</code> to browse accounts.
      </div>
    )
  }

  const profile = selected ? profiles.find((p) => p.name === selected) : undefined

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {profile
        ? <ProfileCard
            profile={profile}
            onFocus={onFocus}
            onSelectFinding={onSelectFinding}
            onBack={() => onSelectAccount(null)}
          />
        : <AccountList profiles={profiles} onSelectAccount={onSelectAccount} />}
    </div>
  )
}
