import { describe, it, expect } from 'vitest'
import { contains, formatIp, overlaps, parseCidr } from '../cidr'

describe('parseCidr', () => {
  it('parses a /24 into inclusive bounds', () => {
    const r = parseCidr('10.0.1.0/24')!
    expect(formatIp(r.start)).toBe('10.0.1.0')
    expect(formatIp(r.end)).toBe('10.0.1.255')
  })

  it('handles the extremes without bitwise overflow', () => {
    const all = parseCidr('0.0.0.0/0')!
    expect(all.start).toBe(0)
    expect(all.end).toBe(2 ** 32 - 1)
    expect(formatIp(all.end)).toBe('255.255.255.255')

    const host = parseCidr('192.168.1.7/32')!
    expect(host.start).toBe(host.end)
    expect(formatIp(host.start)).toBe('192.168.1.7')
  })

  it('masks host bits off, so 10.0.0.5/24 describes 10.0.0.0/24', () => {
    const r = parseCidr('10.0.0.5/24')!
    expect(formatIp(r.start)).toBe('10.0.0.0')
    expect(formatIp(r.end)).toBe('10.0.0.255')
  })

  it('returns null rather than throwing on input it cannot read', () => {
    expect(parseCidr('2001:db8::/32')).toBeNull()
    expect(parseCidr('10.0.0.0')).toBeNull()
    expect(parseCidr('10.0.0.0/33')).toBeNull()
    expect(parseCidr('10.0.300.0/24')).toBeNull()
    expect(parseCidr(undefined)).toBeNull()
  })
})

describe('overlaps / contains', () => {
  it('detects a supernet swallowing a subnet', () => {
    const big = parseCidr('10.0.0.0/16')!
    const small = parseCidr('10.0.5.0/24')!
    expect(overlaps(big, small)).toBe(true)
    expect(contains(big, small)).toBe(true)
    expect(contains(small, big)).toBe(false)
  })

  it('treats adjacent ranges as non-overlapping', () => {
    const a = parseCidr('10.0.0.0/25')!
    const b = parseCidr('10.0.0.128/25')!
    expect(overlaps(a, b)).toBe(false)
  })

  it('is symmetric', () => {
    const a = parseCidr('10.0.0.0/16')!
    const b = parseCidr('10.0.128.0/17')!
    expect(overlaps(a, b)).toBe(overlaps(b, a))
    expect(overlaps(a, b)).toBe(true)
  })
})
