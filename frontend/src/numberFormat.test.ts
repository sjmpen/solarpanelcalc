import { describe, expect, it } from 'vitest'
import { parseDecimal, parseDecimalOrZero } from './numberFormat'

describe('parseDecimal', () => {
  it('parses a comma as the decimal separator', () => {
    expect(parseDecimal('8,5')).toBe(8.5)
  })

  it('parses a period as the decimal separator too', () => {
    expect(parseDecimal('8.5')).toBe(8.5)
  })

  it('parses a whole number with no separator', () => {
    expect(parseDecimal('12')).toBe(12)
  })

  it('trims surrounding whitespace', () => {
    expect(parseDecimal('  3,5  ')).toBe(3.5)
  })

  it('returns null for an empty string', () => {
    expect(parseDecimal('')).toBeNull()
  })

  it('returns null for unparseable input', () => {
    expect(parseDecimal('not a number')).toBeNull()
  })
})

describe('parseDecimalOrZero', () => {
  it('parses a comma-decimal value', () => {
    expect(parseDecimalOrZero('0,5')).toBe(0.5)
  })

  it('returns 0 for an empty string', () => {
    expect(parseDecimalOrZero('')).toBe(0)
  })

  it('returns 0 for unparseable input', () => {
    expect(parseDecimalOrZero('abc')).toBe(0)
  })
})
