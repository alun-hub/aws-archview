// ─── IPv4 CIDR arithmetic ─────────────────────────────────────────────────────
//
// Enough to answer the two questions the validation rules ask: do these two
// ranges overlap, and does this range sit inside that one. IPv6 and malformed
// input return null rather than throwing, so a rule skips an entry it cannot
// reason about instead of taking down the whole analysis on one odd config.

export interface CidrRange {
  /** The input, trimmed — used verbatim in finding messages. */
  text: string
  prefix: number
  /** Inclusive bounds as unsigned 32-bit values held in plain numbers.
   *  `end` can reach 2^32 - 1, which exceeds what bitwise operators handle,
   *  so all comparisons below are arithmetic rather than bitwise. */
  start: number
  end: number
}

const IPV4_CIDR = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/

export function parseCidr(value: unknown): CidrRange | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const m = IPV4_CIDR.exec(text)
  if (!m) return null

  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
  if (octets.some((o) => o > 255)) return null
  const prefix = Number(m[5])
  if (prefix > 32) return null

  const addr = octets.reduce((acc, o) => acc * 256 + o, 0)
  const size = 2 ** (32 - prefix)
  // Mask the host bits off so 10.0.0.5/24 is treated as the 10.0.0.0/24 it
  // actually describes — LZA configs do carry such entries.
  const start = Math.floor(addr / size) * size
  return { text, prefix, start, end: start + size - 1 }
}

export function overlaps(a: CidrRange, b: CidrRange): boolean {
  return a.start <= b.end && b.start <= a.end
}

/** Whether `inner` lies entirely within `outer`. */
export function contains(outer: CidrRange, inner: CidrRange): boolean {
  return outer.start <= inner.start && inner.end <= outer.end
}

export function formatIp(value: number): string {
  return [
    Math.floor(value / 16777216) % 256,
    Math.floor(value / 65536) % 256,
    Math.floor(value / 256) % 256,
    value % 256,
  ].join('.')
}

/** Human-readable span, e.g. "10.0.0.0 – 10.0.0.255". Used in findings where
 *  the overlap isn't obvious from the two prefixes alone. */
export function describeRange(range: CidrRange): string {
  return `${formatIp(range.start)} – ${formatIp(range.end)}`
}
