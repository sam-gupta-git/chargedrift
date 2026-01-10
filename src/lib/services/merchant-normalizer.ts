import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Merchant Normalizer
 * Groups similar merchant names to identify recurring charges across variations
 * Examples: "NETFLIX.COM" and "Netflix" → "Netflix"
 */

// Common patterns to strip from merchant names
const STRIP_PATTERNS = [
  /\s*\*+\s*/g,                    // Asterisks
  /\s*#\d+\s*/g,                   // Store numbers like #1234
  /\s*-\s*\d{4,}/g,               // Reference numbers
  /\s+\d{2,4}\/\d{2,4}$/,         // Date suffixes
  /\s+(LLC|INC|CORP|CO|LTD)\.?$/i, // Company suffixes
  /\s+PURCHASE\s*$/i,              // "PURCHASE" suffix
  /\s+PAYMENT\s*$/i,               // "PAYMENT" suffix
  /\s+RECURRING\s*$/i,             // "RECURRING" suffix
  /\s+SUBSCRIPTION\s*$/i,          // "SUBSCRIPTION" suffix
  /^(SQ\s*\*|TST\s*\*|SP\s+)/i,   // Payment processor prefixes
  /\s+\d{3}-\d{3}-\d{4}$/,         // Phone numbers
  /\s+[A-Z]{2}\s*$/,               // State abbreviations at end
  /\.(COM|NET|ORG|IO)$/i,          // Domain extensions
  /\s+AUTOPAY\s*$/i,               // Autopay suffix
  /\s+BILL\s+(PAY|PAYMENT)\s*$/i,  // Bill pay suffix
]

// Known merchant mappings for common services
const KNOWN_MERCHANTS: Record<string, string> = {
  'netflix': 'Netflix',
  'spotify': 'Spotify',
  'apple': 'Apple',
  'amazon': 'Amazon',
  'hulu': 'Hulu',
  'disney': 'Disney+',
  'disneyplus': 'Disney+',
  'hbo': 'HBO Max',
  'youtube': 'YouTube',
  'google': 'Google',
  'microsoft': 'Microsoft',
  'adobe': 'Adobe',
  'dropbox': 'Dropbox',
  'github': 'GitHub',
  'slack': 'Slack',
  'zoom': 'Zoom',
  'openai': 'OpenAI',
  'chatgpt': 'OpenAI',
  'notion': 'Notion',
  'figma': 'Figma',
  'canva': 'Canva',
  'grammarly': 'Grammarly',
  'nordvpn': 'NordVPN',
  'expressvpn': 'ExpressVPN',
  '1password': '1Password',
  'lastpass': 'LastPass',
  'bitwarden': 'Bitwarden',
  'audible': 'Audible',
  'kindle': 'Amazon Kindle',
  'prime': 'Amazon Prime',
  'paramount': 'Paramount+',
  'peacock': 'Peacock',
  'att': 'AT&T',
  'verizon': 'Verizon',
  'tmobile': 'T-Mobile',
  'comcast': 'Comcast/Xfinity',
  'xfinity': 'Comcast/Xfinity',
  'spectrum': 'Spectrum',
  'cox': 'Cox',
}

export function normalizeMerchantName(rawName: string): string {
  let normalized = rawName.trim().toUpperCase()
  
  // Apply strip patterns
  for (const pattern of STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, '')
  }
  
  // Clean up whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim()
  
  // Check against known merchants
  const lowerNormalized = normalized.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [key, value] of Object.entries(KNOWN_MERCHANTS)) {
    if (lowerNormalized.includes(key)) {
      return value
    }
  }
  
  // Title case the result
  return normalized
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Calculate similarity between two merchant names using Levenshtein distance
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[b.length][a.length]
}

export function calculateSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  if (normA === normB) return 1
  if (normA.length === 0 || normB.length === 0) return 0
  
  const distance = levenshteinDistance(normA, normB)
  const maxLength = Math.max(normA.length, normB.length)
  
  return 1 - distance / maxLength
}

/**
 * Find or create a merchant for a given raw name
 */
export async function findOrCreateMerchant(
  supabase: SupabaseClient,
  userId: string,
  rawName: string
): Promise<string> {
  const normalizedName = normalizeMerchantName(rawName)
  
  // Check if we already have an alias for this raw name
  const { data: existingAlias } = await supabase
    .from('merchant_aliases')
    .select('merchant_id')
    .eq('user_id', userId)
    .eq('raw_name', rawName)
    .single()
  
  if (existingAlias) {
    return existingAlias.merchant_id
  }
  
  // Check if merchant with normalized name exists
  const { data: existingMerchant } = await supabase
    .from('merchants')
    .select('id')
    .eq('user_id', userId)
    .eq('name', normalizedName)
    .single()
  
  let merchantId: string
  
  if (existingMerchant) {
    merchantId = existingMerchant.id
    
    // Update raw_names array
    await supabase
      .from('merchants')
      .update({
        raw_names: supabase.rpc('array_append_unique', {
          arr: 'raw_names',
          val: rawName
        })
      })
      .eq('id', merchantId)
  } else {
    // Try to find a similar merchant (similarity > 0.8)
    const { data: allMerchants } = await supabase
      .from('merchants')
      .select('id, name')
      .eq('user_id', userId)
    
    let foundSimilar = false
    if (allMerchants) {
      for (const merchant of allMerchants) {
        if (calculateSimilarity(normalizedName, merchant.name) > 0.8) {
          merchantId = merchant.id
          foundSimilar = true
          break
        }
      }
    }
    
    if (!foundSimilar) {
      // Create new merchant
      const { data: newMerchant, error } = await supabase
        .from('merchants')
        .insert({
          user_id: userId,
          name: normalizedName,
          raw_names: [rawName]
        })
        .select('id')
        .single()
      
      if (error || !newMerchant) {
        throw new Error(`Failed to create merchant: ${error?.message}`)
      }
      
      merchantId = newMerchant.id
    }
  }
  
  // Create alias
  await supabase
    .from('merchant_aliases')
    .upsert({
      merchant_id: merchantId!,
      raw_name: rawName,
      user_id: userId
    }, {
      onConflict: 'user_id,raw_name'
    })
  
  return merchantId!
}
