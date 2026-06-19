export function kindBorderColor(kind: string): string {
  switch (kind) {
    case 'root': case 'ou':
      return '#E7157B'
    case 'account': case 'management-account':
      return '#FF9900'
    case 'vpc':
      return '#8C4FFF'
    case 'subnet-public':
      return '#248814'
    case 'subnet-private':
      return '#1A6CAE'
    case 'subnet-firewall':
      return '#CC3300'
    case 'subnet-tgw':
      return '#6B3FA0'
    case 'region':
      return '#4A90D9'
    case 'on-premises':
      return '#5A5A5A'
    case 'tgw-rt-group':
      return '#6B3FA0'
    default:
      return '#232F3E'
  }
}

export function kindBackground(kind: string): string {
  switch (kind) {
    case 'root':                                   return 'rgba(231,21,123,0.01)'
    case 'ou':                                     return 'rgba(231,21,123,0.02)'
    case 'account': case 'management-account':     return 'rgba(255,153,0,0.02)'
    case 'vpc':                                    return 'rgba(140,79,255,0.02)'
    case 'subnet-public':                          return 'rgba(36,136,20,0.04)'
    case 'subnet-private':                         return 'rgba(26,108,174,0.04)'
    case 'subnet-firewall':                        return 'rgba(204,51,0,0.04)'
    case 'subnet-tgw':                             return 'rgba(107,63,160,0.04)'
    case 'region':                                 return 'rgba(74,144,217,0.04)'
    case 'on-premises':                            return 'rgba(90,90,90,0.06)'
    case 'tgw-rt-group':                           return 'rgba(107,63,160,0.06)'
    default:                                       return 'rgba(35,47,62,0.03)'
  }
}
