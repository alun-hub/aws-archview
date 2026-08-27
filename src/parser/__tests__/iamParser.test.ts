import { describe, it, expect } from 'vitest'
import { parseIam } from '../iamParser'
import type { IamConfig } from '../types'

describe('iamParser', () => {
  it('should render account-level policySets, roleSets, groupSets, and userSets as children of the IAM root', () => {
    const cfg: IamConfig = {
      identityCenter: { name: 'test-sso' },
      policySets: [
        {
          name: 'Custom-Policies',
          deploymentTargets: { organizationalUnits: ['Workloads'] },
          policies: [{ name: 'S3-ReadOnly', policy: 'iam-policies/s3-readonly.json' }],
        },
      ],
      roleSets: [
        {
          name: 'EC2-Roles',
          deploymentTargets: { accounts: ['Dev'] },
          roles: [
            {
              name: 'EC2-SSM-Role',
              assumedBy: [{ type: 'service', principal: 'ec2.amazonaws.com' }],
              policies: { awsManaged: ['AmazonSSMManagedInstanceCore'], customerManaged: ['S3-ReadOnly'] },
              boundaryPolicy: 'Custom-Boundary',
              instanceProfile: true,
            },
          ],
        },
      ],
      groupSets: [
        {
          name: 'Admin-Groups',
          deploymentTargets: { organizationalUnits: ['Root'] },
          groups: [{ name: 'Administrators', policies: { awsManaged: ['AdministratorAccess'] } }],
        },
      ],
      userSets: [
        {
          name: 'Break-Glass-Users',
          deploymentTargets: { accounts: ['Management'] },
          users: [{ username: 'break-glass-admin', group: 'Administrators', boundaryPolicy: 'Custom-Boundary' }],
        },
      ],
    }

    const model = parseIam(cfg)
    const rootId = model.nodes.find(n => n.kind === 'account')!.id

    const policySet = model.nodes.find(n => n.label === 'Custom-Policies')!
    expect(policySet.parentId).toBe(rootId)
    expect(policySet.data.sublabel).toBe('Policy Set')
    expect(policySet.data.deploymentTargets).toBe('OU: Workloads')
    expect(policySet.data.policies).toEqual([{ name: 'S3-ReadOnly', policy: 'iam-policies/s3-readonly.json' }])

    const roleSet = model.nodes.find(n => n.label === 'EC2-Roles')!
    expect(roleSet.data.deploymentTargets).toBe('Dev')
    const roles = roleSet.data.roles as Record<string, unknown>[]
    expect(roles).toEqual([{
      name: 'EC2-SSM-Role',
      assumedBy: 'service:ec2.amazonaws.com',
      policies: 'AmazonSSMManagedInstanceCore, S3-ReadOnly',
      boundaryPolicy: 'Custom-Boundary',
      instanceProfile: true,
    }])

    const groupSet = model.nodes.find(n => n.label === 'Admin-Groups')!
    expect(groupSet.data.groups).toEqual([{ name: 'Administrators', policies: 'AdministratorAccess' }])

    const userSet = model.nodes.find(n => n.label === 'Break-Glass-Users')!
    expect(userSet.data.users).toEqual([{ name: 'break-glass-admin', group: 'Administrators', boundaryPolicy: 'Custom-Boundary' }])
  })

  it('should resolve a policySet policy document into statements when the file is loaded', () => {
    const cfg: IamConfig = {
      policySets: [
        {
          name: 'Custom-Policies',
          policies: [{ name: 'S3-ReadOnly', policy: 'iam-policies/s3-readonly.json' }],
        },
      ],
    }
    const loadedFiles = {
      'iam-policies/s3-readonly.json': JSON.stringify({
        Statement: [{ Sid: 'ReadOnly', Effect: 'Allow', Action: ['s3:GetObject'], Resource: 'arn:aws:s3:::bucket/*' }],
      }),
    }

    const model = parseIam(cfg, undefined, loadedFiles)
    const policySet = model.nodes.find(n => n.label === 'Custom-Policies')!
    expect(policySet.data.policyStatements).toEqual([
      { name: 'S3-ReadOnly [ReadOnly]', effect: 'Allow', action: 's3:GetObject', resource: 'arn:aws:s3:::bucket/*' },
    ])
  })

  it('should fall back to an index-based label when a set has no name', () => {
    const cfg: IamConfig = {
      roleSets: [{ deploymentTargets: { organizationalUnits: ['Root'] }, roles: [{ name: 'Some-Role' }] }],
    }
    const model = parseIam(cfg)
    expect(model.nodes.find(n => n.data.sublabel === 'Role Set')?.label).toBe('Role Set 1')
  })
})
