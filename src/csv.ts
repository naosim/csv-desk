export type CsvTable = {
  name: string
  headers: string[]
  rows: string[][] 
  newline: '\n' | '\r\n'
  dirty: boolean
}

export function detectNewline(text: string): '\n' | '\r\n' {
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  return crlf >= lf ? '\r\n' : '\n'
}

export function parseCsv(text: string): { headers: string[]; rows: string[][]; newline: '\n' | '\r\n' } {
  const newline = detectNewline(text)
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\r' || char === '\n') {
      record.push(field)
      if (record.some((value) => value.length > 0) || record.length > 1) records.push(record)
      record = []
      field = ''
      if (char === '\r' && text[i + 1] === '\n') i++
    } else {
      field += char
    }
  }
  if (inQuotes) throw new Error('Closed double quotes are required for the last field')
  record.push(field)
  if (record.some((value) => value.length > 0) || record.length > 1) records.push(record)
  if (records.length === 0) return { headers: [], rows: [], newline }

  const width = records[0].length
  const headers = records[0].map((header, index) => header || `Column${index + 1}`)
  const rows = records.slice(1).map((row) => {
    const normalized = [...row]
    while (normalized.length < width) normalized.push('')
    return normalized.slice(0, width)
  })
  return { headers, rows, newline }
}

export function serializeCsv(headers: string[], rows: string[][], newline: '\n' | '\r\n'): string {
  const escapeField = (value: string) => {
    if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
  }
  const records = [headers, ...rows].map((row) =>
    row.map((value) => escapeField(value ?? '')).join(',')
  )
  return records.join(newline)
}

export function inferColumnType(values: string[]): 'string' | 'number' | 'boolean' | 'date' {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean)
  if (nonEmpty.length === 0) return 'string'
  if (nonEmpty.every((value) => /^(true|false)$/i.test(value))) return 'boolean'
  if (nonEmpty.every((value) => {
    if (/^0\d+/.test(value)) return false
    return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(value)
  })) return 'number'
  if (nonEmpty.every((value) => /^\d{4}-\d{2}-\d{2}(?:[Tt ].*)?$/.test(value) &&
    !Number.isNaN(Date.parse(value)))) return 'date'
  return 'string'
}
