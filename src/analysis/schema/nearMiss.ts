/** Levenshtein distance, capped: once the running minimum exceeds `max` the
 *  answer can only get worse, so bail out. Keys are short, but this runs over
 *  every key of every object in a large config. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      row.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = row
  }
  return prev[b.length]
}

/** How close a key has to be to a known one before we call it a typo. Short
 *  keys get a tighter budget: at distance 2, "vpc" is as close to "vpcs" as it
 *  is to half the vocabulary. */
function budget(key: string): number {
  if (key.length <= 4) return 1
  return 2
}

/**
 * The known key an unrecognized key was probably meant to be, or null.
 *
 * Returning null for anything that isn't a near-miss is the whole point: LZA's
 * real schema is much larger than what this app describes, so an unknown key is
 * usually a field we simply don't model. Only a key that looks like a
 * misspelling of one we do know is worth reporting.
 */
export function nearestKnownKey(key: string, known: readonly string[]): string | null {
  const lower = key.toLowerCase()

  // Case-only and plural-only slips are the common ones and are unambiguous,
  // so they short-circuit ahead of the distance search.
  for (const candidate of known) {
    const c = candidate.toLowerCase()
    if (c === lower) return candidate
    if (c === `${lower}s` || `${c}s` === lower) return candidate
  }

  const max = budget(key)
  let best: string | null = null
  let bestDistance = max + 1
  let tied = false

  for (const candidate of known) {
    const d = editDistance(lower, candidate.toLowerCase(), max)
    if (d > max) continue
    if (d < bestDistance) {
      bestDistance = d
      best = candidate
      tied = false
    } else if (d === bestDistance) {
      tied = true
    }
  }

  // Two equally close candidates means we'd be guessing which one was meant —
  // and a wrong suggestion is worse than none.
  return tied ? null : best
}
