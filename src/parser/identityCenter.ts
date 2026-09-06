import type { IamConfig, IdentityCenterAssignmentConfig, PermissionSetConfig } from './types'

/**
 * Identity Center permission sets and assignments, wherever they are declared.
 *
 * LZA nests both under `identityCenter`. Older hand-written configs — and this
 * project's own samples, before they were checked against the schema — put them
 * at the top level of iam-config. Reading only one place meant a valid config
 * showed no permission sets at all.
 */
export function permissionSets(iam: IamConfig | undefined): PermissionSetConfig[] {
  return iam?.identityCenter?.identityCenterPermissionSets ?? iam?.permissionSets ?? []
}

/** A principal on an assignment, normalised from either shape LZA accepts. */
export interface AssignmentPrincipal {
  type: string
  name: string
}

export interface NormalisedAssignment extends IdentityCenterAssignmentConfig {
  principals: AssignmentPrincipal[]
}

/**
 * Assignments with their principals normalised.
 *
 * Current LZA uses `principals: [{ type, name }]`; the older
 * `principalType` + `principalId` pair is still accepted, so both are read and
 * presented the same way.
 */
export function assignments(iam: IamConfig | undefined): NormalisedAssignment[] {
  const raw = iam?.identityCenter?.identityCenterAssignments ?? iam?.identityCenterAssignments ?? []
  return raw.map((a) => ({
    ...a,
    principals: a.principals?.length
      ? a.principals.map((p) => ({ type: p.type ?? 'GROUP', name: p.name ?? '' }))
      : a.principalId
        ? [{ type: a.principalType ?? 'GROUP', name: a.principalId }]
        : [],
  }))
}

/** "Group: aws-admins", for the one-line summaries the diagram shows. */
export function describePrincipals(principals: AssignmentPrincipal[]): string {
  return principals
    .map((p) => `${p.type === 'GROUP' ? 'Group' : 'User'}: ${p.name}`)
    .join(', ')
}
