import mammoth from 'mammoth'

const WORD_RE = /\b[A-Za-z]+(?:'[A-Za-z]+)?\b/g

const IPA_CHAR_RE =
  /[æɑɒɐɔəɚɜɝɪɨʊʌɤɯθðʃʒɕʑŋɲɳɱɹɻɾɽʎɫɟɡɢɦħʕʔˈˌːˑ̩̯̃͜͡ᵻᵿɸβçɣχ]/u

/** Keep patterns tight — never use .* that can swallow a whole page. */
const HEADER_FOOTER_PATTERNS: RegExp[] = [
  /糖豆教育咨询（苏州）有限公司/g,
  /糖豆教育/g,
  /jellybean\s+education\s+consulting\s*（?\s*suzhou\s*）?\s*co\.?\s*,?\s*ltd\.?/gi,
  /jellybean\s+education\s+consulting\s*\(?\s*suzhou\s*\)?\s*co\.?\s*,?\s*ltd\.?/gi,
  /jellybean\s+education/gi,
  /jelly\s*bean\s*education/gi,
  /jelly\s*bean/gi,
  /jellybean/gi,
]

const SECTION_NOISE_PATTERNS: RegExp[] = [
  /section\s*\d+(?:\s*&\s*\d+)?\s*:\s*[a-z\s]{0,40}scenario/gi,
  /\b(?:survival|academic)\s+scenario\b/gi,
]

const NOISE_WORDS = new Set(
  [
    'jelly',
    'bean',
    'jellybean',
    'education',
    'consulting',
    'suzhou',
    'ltd',
    'limited',
    'company',
    'corp',
    'inc',
    'llc',
    'co',
    'copyright',
    'page',
    'pages',
    'unit',
    'lesson',
    'section',
    'scenario',
    'survival',
    'academic',
    'vocabulary',
    'vocab',
    'words',
    'word',
    'list',
    'phonetic',
    'phonetics',
    'pronunciation',
    'definition',
    'meaning',
    'english',
    'chinese',
    'notes',
    'note',
    'answer',
    'answers',
    'key',
    'name',
    'class',
    'date',
    'score',
    'total',
    'people',
    'fees',
    'diet',
    'accommodation',
    'appendix',
    'lectures',
    'lecture',
    'www',
    'http',
    'https',
    'com',
    'cn',
    'org',
  ].map((w) => w.toLowerCase()),
)

function stripHeadersFooters(text: string): string {
  let t = text
  for (const re of HEADER_FOOTER_PATTERNS) t = t.replace(re, ' ')
  for (const re of SECTION_NOISE_PATTERNS) t = t.replace(re, ' ')
  // Chinese glosses become entry separators
  t = t.replace(/[\u4e00-\u9fff]+/g, '\n')
  return t
}

function stripPhoneticBlocks(text: string): string {
  let t = text
  // Non-greedy slash IPA, run twice to clear pairs like /a//b/
  for (let i = 0; i < 4; i++) {
    const next = t.replace(/\/[^/\n]*\//g, '\n')
    if (next === t) break
    t = next
  }
  t = t.replace(/\[[^\]\n]{1,80}\]/g, '\n')
  t = t
    .split(/(\s+)/)
    .map((token) => (IPA_CHAR_RE.test(token) ? '\n' : token))
    .join('')
  t = t.replace(/[ˈˌːˑ͜͡]+/g, ' ')
  return t
}

const COMPOUND_TAILS = [
  'bills',
  'bill',
  'fee',
  'fees',
  'room',
  'rooms',
  'area',
  'office',
  'station',
  'centre',
  'center',
  'house',
  'family',
  'hostel',
]

function maybeSpaceCompound(word: string): string {
  for (const tail of COMPOUND_TAILS) {
    if (word.endsWith(tail) && word.length > tail.length + 2) {
      const head = word.slice(0, -tail.length)
      if (head.length >= 3 && !NOISE_WORDS.has(head)) return `${head} ${tail}`
    }
  }
  return word
}

/**
 * PDF worksheets often emit "la n dlo r d" instead of "landlord".
 * Each vocab entry is already separated by Chinese glosses / phonetics,
 * so join all latin fragments in the segment into one dictation item.
 */
function collapseSpacedEnglish(segment: string): string[] {
  const tokens = segment
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Za-z'\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return []

  const avg = tokens.reduce((s, t) => s + t.length, 0) / tokens.length
  // Normal documents: tokens are already whole words
  if (avg >= 4.2 && tokens.every((t) => t.length >= 2)) {
    return tokens
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2 && !NOISE_WORDS.has(t))
  }

  const joined = tokens.join('').toLowerCase()
  if (joined.length < 2 || NOISE_WORDS.has(joined)) return []
  return [maybeSpaceCompound(joined)]
}

export function extractWords(text: string): string[] {
  const cleaned = stripPhoneticBlocks(stripHeadersFooters(text))
  const segments = cleaned.split(/[\n;；]+/).map((s) => s.trim()).filter(Boolean)

  const words: string[] = []
  const seen = new Set<string>()

  for (const segment of segments) {
    if (!/[A-Za-z]/.test(segment)) continue
    for (const w of collapseSpacedEnglish(segment)) {
      if (w.length < 2 || NOISE_WORDS.has(w)) continue
      if (w.length <= 3 && !/[aeiouy]/.test(w)) continue
      if (seen.has(w)) continue
      seen.add(w)
      words.push(w)
    }
  }

  // Plain documents without worksheet formatting
  if (!words.length) {
    for (const w of cleaned.match(WORD_RE) || []) {
      const lower = w.toLowerCase()
      if (lower.length < 2 || NOISE_WORDS.has(lower) || seen.has(lower)) continue
      seen.add(lower)
      words.push(lower)
    }
  }

  return words
}

function splitTextIntoPages(text: string, wordsPerPage = 20): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\f/g, '\n\n---PAGE---\n\n')
  if (normalized.includes('---PAGE---')) {
    return normalized
      .split('---PAGE---')
      .map((chunk) => extractWords(chunk))
      .filter((p) => p.length > 0)
  }

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length >= 2) {
    const paraPages = paragraphs.map((para) => extractWords(para)).filter((p) => p.length > 0)
    if (paraPages.length >= 2) return paraPages
  }

  const all = extractWords(normalized)
  const pages: string[][] = []
  for (let i = 0; i < all.length; i += wordsPerPage) {
    pages.push(all.slice(i, i + wordsPerPage))
  }
  return pages.filter((p) => p.length > 0)
}

async function extractPdfPages(data: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    verbosity: 0,
  })
  const pdf = await loadingTask.promise
  const pages: string[][] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    const words = extractWords(text)
    if (words.length) pages.push(words)
  }

  return pages
}

async function extractDocxPages(data: ArrayBuffer): Promise<string[][]> {
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return splitTextIntoPages(result.value)
}

export async function extractPagesFromFile(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase()
  const data = await file.arrayBuffer()
  if (lower.endsWith('.pdf')) {
    return extractPdfPages(data)
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) {
    return extractDocxPages(data)
  }
  if (lower.endsWith('.txt')) {
    return splitTextIntoPages(new TextDecoder('utf-8').decode(data))
  }
  throw new Error('不支持的文件类型')
}
