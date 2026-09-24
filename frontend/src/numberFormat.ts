/**
 * Parses a Finnish-style decimal number, accepting both ',' and '.' as the
 * decimal separator (Finnish convention is ',' - e.g. "8,5" - but '.' is
 * accepted too, so pasted/typed numbers in either style still work).
 * Returns null for empty or unparseable input.
 */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed.replace(',', '.'))
  return Number.isNaN(parsed) ? null : parsed
}

/** Same as parseDecimal, but returns 0 instead of null for empty/invalid input. */
export function parseDecimalOrZero(value: string): number {
  return parseDecimal(value) ?? 0
}
