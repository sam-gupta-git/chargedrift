/**
 * CSV Transaction Parser
 * Parses bank transaction CSV exports into normalized transaction format
 */

export interface ParsedTransaction {
  date: string
  description: string
  amount: number
  rawLine: string
}

export interface CSVParseResult {
  transactions: ParsedTransaction[]
  errors: string[]
  skipped: number
}

// Common date formats from bank exports
const DATE_PATTERNS = [
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,      // MM/DD/YYYY or M/D/YYYY
  /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,      // MM/DD/YY
  /^(\d{4})-(\d{2})-(\d{2})$/,            // YYYY-MM-DD
  /^(\d{2})-(\d{2})-(\d{4})$/,            // DD-MM-YYYY
  /^(\d{1,2})-(\d{1,2})-(\d{4})$/,        // M-D-YYYY
]

function parseDate(dateStr: string): string | null {
  const cleaned = dateStr.trim().replace(/["']/g, '')
  
  // Try YYYY-MM-DD format first (ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned
  }
  
  // Try MM/DD/YYYY format
  const mmddyyyy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Try MM/DD/YY format
  const mmddyy = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (mmddyy) {
    const [, month, day, shortYear] = mmddyy
    const year = parseInt(shortYear) > 50 ? `19${shortYear}` : `20${shortYear}`
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  // Try parsing with Date constructor as fallback
  const parsed = new Date(cleaned)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  
  return null
}

function parseAmount(amountStr: string): number | null {
  // Remove currency symbols, quotes, and whitespace
  let cleaned = amountStr.trim()
    .replace(/["'$€£¥]/g, '')
    .replace(/\s/g, '')
  
  // Handle parentheses for negative numbers (common in accounting)
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')')
  if (isNegative) {
    cleaned = cleaned.slice(1, -1)
  }
  
  // Handle explicit negative sign
  const hasNegativeSign = cleaned.startsWith('-')
  if (hasNegativeSign) {
    cleaned = cleaned.slice(1)
  }
  
  // Remove commas (thousand separators)
  cleaned = cleaned.replace(/,/g, '')
  
  const amount = parseFloat(cleaned)
  if (isNaN(amount)) return null
  
  return (isNegative || hasNegativeSign) ? -amount : amount
}

function splitCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

function detectDelimiter(lines: string[]): string {
  // Check first few lines for delimiter
  const sampleLines = lines.slice(0, 5)
  
  // Count occurrences of common delimiters
  let tabCount = 0
  let commaCount = 0
  
  for (const line of sampleLines) {
    tabCount += (line.match(/\t/g) || []).length
    commaCount += (line.match(/,/g) || []).length
  }
  
  // Use tab if it appears consistently, otherwise comma
  if (tabCount > commaCount && tabCount >= sampleLines.length) {
    return '\t'
  }
  return ','
}

function looksLikeDate(value: string): boolean {
  // Check if value looks like a date
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value) || 
         /^\d{4}-\d{2}-\d{2}$/.test(value) ||
         /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(value)
}

function looksLikeAmount(value: string): boolean {
  // Check if value looks like a monetary amount
  const cleaned = value.replace(/[$,"\s]/g, '')
  return /^-?\d+\.?\d*$/.test(cleaned)
}

interface ColumnMapping {
  dateIndex: number
  descriptionIndex: number
  amountIndex: number
  debitIndex?: number
  creditIndex?: number
}

function detectColumns(headers: string[]): ColumnMapping | null {
  // Normalize headers: lowercase, remove punctuation, trim
  const lowerHeaders = headers.map(h => 
    h.toLowerCase().replace(/["'.]/g, '').replace(/\s+/g, ' ').trim()
  )
  
  let dateIndex = -1
  let descriptionIndex = -1
  let amountIndex = -1
  let debitIndex = -1
  let creditIndex = -1
  
  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i]
    
    // Date column - match "trans date", "trans. date", "date", "post date", etc.
    if (dateIndex === -1 && (
      h.includes('date') || 
      h === 'posted' || 
      h.includes('trans')
    )) {
      dateIndex = i
    }
    
    // Description column
    if (descriptionIndex === -1 && (
      h.includes('description') || 
      h.includes('descrip') ||
      h.includes('merchant') || 
      h.includes('payee') ||
      h === 'name' ||
      h === 'memo' ||
      h.includes('narrative') ||
      h.includes('details')
    )) {
      descriptionIndex = i
    }
    
    // Amount column (single column for both debit/credit)
    if (amountIndex === -1 && (
      h === 'amount' || 
      h.includes('amount') ||
      h === 'value' ||
      h === 'sum'
    )) {
      amountIndex = i
    }
    
    // Separate debit/credit columns
    if (h === 'debit' || h === 'withdrawal' || h.includes('debit')) {
      debitIndex = i
    }
    if (h === 'credit' || h === 'deposit' || h.includes('credit')) {
      creditIndex = i
    }
  }
  
  // If no header matches, try positional detection for simple CSVs
  if (dateIndex === -1 && headers.length >= 3) {
    // Assume: Date, Description, Amount
    dateIndex = 0
    descriptionIndex = 1
    amountIndex = 2
  }
  
  if (dateIndex === -1 || descriptionIndex === -1) {
    return null
  }
  
  // Need either amount column or both debit/credit
  if (amountIndex === -1 && (debitIndex === -1 || creditIndex === -1)) {
    // Try to use the last numeric column as amount
    amountIndex = headers.length - 1
  }
  
  return {
    dateIndex,
    descriptionIndex,
    amountIndex,
    debitIndex: debitIndex >= 0 ? debitIndex : undefined,
    creditIndex: creditIndex >= 0 ? creditIndex : undefined,
  }
}

function detectColumnsFromData(fields: string[]): ColumnMapping | null {
  let dateIndex = -1
  let descriptionIndex = -1
  let amountIndex = -1
  
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    
    if (dateIndex === -1 && looksLikeDate(field)) {
      dateIndex = i
    } else if (amountIndex === -1 && looksLikeAmount(field)) {
      amountIndex = i
    } else if (descriptionIndex === -1 && field.length > 2 && !looksLikeDate(field) && !looksLikeAmount(field)) {
      descriptionIndex = i
    }
  }
  
  if (dateIndex === -1 || descriptionIndex === -1 || amountIndex === -1) {
    return null
  }
  
  return { dateIndex, descriptionIndex, amountIndex }
}

export function parseCSV(csvContent: string): CSVParseResult {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim())
  const transactions: ParsedTransaction[] = []
  const errors: string[] = []
  let skipped = 0
  
  if (lines.length < 1) {
    return { transactions: [], errors: ['CSV file is empty'], skipped: 0 }
  }
  
  // Detect delimiter (tab vs comma)
  const delimiter = detectDelimiter(lines)
  
  // Parse first line to check if it's a header or data
  const firstLineFields = splitCSVLine(lines[0], delimiter)
  
  // Check if first line looks like headers or data
  const firstLineIsData = firstLineFields.some(f => looksLikeDate(f)) && 
                          firstLineFields.some(f => looksLikeAmount(f))
  
  let mapping: ColumnMapping | null = null
  let dataStartIndex = 0
  
  if (firstLineIsData) {
    // No header row - detect columns by content
    mapping = detectColumnsFromData(firstLineFields)
    dataStartIndex = 0
  } else {
    // Has header row
    mapping = detectColumns(firstLineFields)
    dataStartIndex = 1
  }
  
  if (!mapping) {
    return { 
      transactions: [], 
      errors: ['Could not detect required columns. Please ensure your file has Date, Description, and Amount columns.'], 
      skipped: 0 
    }
  }
  
  // Parse data rows
  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const fields = splitCSVLine(line, delimiter)
    
    // Parse date
    const dateStr = fields[mapping.dateIndex]
    const date = parseDate(dateStr || '')
    if (!date) {
      errors.push(`Row ${i + 1}: Invalid date "${dateStr}"`)
      skipped++
      continue
    }
    
    // Parse description
    const description = (fields[mapping.descriptionIndex] || '').replace(/["']/g, '').trim()
    if (!description) {
      skipped++
      continue
    }
    
    // Parse amount
    let amount: number | null = null
    
    if (mapping.debitIndex !== undefined && mapping.creditIndex !== undefined) {
      // Separate debit/credit columns
      const debit = parseAmount(fields[mapping.debitIndex] || '0')
      const credit = parseAmount(fields[mapping.creditIndex] || '0')
      
      if (debit && debit > 0) {
        amount = debit // Debit is positive (money out)
      } else if (credit && credit > 0) {
        amount = -credit // Credit is negative (money in)
      } else {
        amount = 0
      }
    } else {
      // Single amount column
      amount = parseAmount(fields[mapping.amountIndex] || '')
    }
    
    if (amount === null) {
      errors.push(`Row ${i + 1}: Invalid amount`)
      skipped++
      continue
    }
    
    // Skip zero amounts
    if (amount === 0) {
      skipped++
      continue
    }
    
    // Convert to absolute value - we track all charges regardless of sign convention
    // Some banks use negative for charges (debits), others use positive
    const absoluteAmount = Math.abs(amount)
    
    transactions.push({
      date,
      description,
      amount: absoluteAmount,
      rawLine: line,
    })
  }
  
  // Sort by date
  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  return { transactions, errors, skipped }
}

export function generateSampleCSV(): string {
  return `Date,Description,Amount
01/15/2024,Netflix,15.99
02/15/2024,Netflix,15.99
03/15/2024,Netflix,17.99
04/15/2024,Netflix,17.99
01/10/2024,Spotify Premium,9.99
02/10/2024,Spotify Premium,9.99
03/10/2024,Spotify Premium,10.99
04/10/2024,Spotify Premium,10.99
01/05/2024,Amazon Prime,14.99
02/05/2024,Amazon Prime,14.99
03/05/2024,Amazon Prime,14.99
04/05/2024,Amazon Prime,16.99`
}
