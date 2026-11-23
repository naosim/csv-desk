import { describe, expect, it } from 'vitest'
import { detectNewline, inferColumnType, parseCsv, serializeCsv } from './csv'

describe('CSV parser and writer', () => {
  it('preserves quoted commas, quotes, and embedded newlines', () => {
    const input = 'id,note\r\n1,"hello, ""wide""\nworld"'
    const parsed = parseCsv(input)

    expect(parsed.headers).toEqual(['id', 'note'])
    expect(parsed.rows[0][1]).toBe('hello, "wide"\nworld')
    expect(parsed.newline).toBe('\r\n')
    expect(serializeCsv(parsed.headers, parsed.rows, parsed.newline)).toBe(input)
  })

  it('does not turn leading-zero values into numbers', () => {
    expect(inferColumnType(['00123', '00456'])).toBe('string')
  })

  it('infers booleans, numbers, dates, and mixed strings', () => {
    expect(inferColumnType(['true', 'FALSE'])).toBe('boolean')
    expect(inferColumnType(['12', '-3.5'])).toBe('number')
    expect(inferColumnType(['2026-11-23', '2026-11-24'])).toBe('date')
    expect(inferColumnType(['12', 'A'])).toBe('string')
  })

  it('detects the dominant newline format', () => {
    expect(detectNewline('a,b\n1,2\n')).toBe('\n')
    expect(detectNewline('a,b\r\n1,2\r\n')).toBe('\r\n')
  })
})
