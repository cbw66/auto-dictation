const cache = new Map<string, string>()

function normalizeWord(word: string) {
  return word.trim().toLowerCase().replace(/[^a-z'-]/g, '')
}

function cleanChinese(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[；;。.!?]+$/g, '')
    .slice(0, 32)
}

async function fetchOne(word: string): Promise<string> {
  const key = normalizeWord(word)
  if (!key) return ''
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(key)}&langpair=en|zh-CN`,
    )
    if (!res.ok) {
      cache.set(key, '')
      return ''
    }
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
    }
    const value = cleanChinese(data.responseData?.translatedText || '')
    cache.set(key, value)
    return value
  } catch {
    cache.set(key, '')
    return ''
  }
}

export async function fetchMeanings(words: string[]): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(words.map(normalizeWord).filter(Boolean)))
  const out: Record<string, string> = {}
  await Promise.all(
    uniq.map(async (w) => {
      out[w] = await fetchOne(w)
    }),
  )
  return out
}

export function lookupMeaning(map: Record<string, string>, word: string): string {
  return map[normalizeWord(word)] || ''
}
