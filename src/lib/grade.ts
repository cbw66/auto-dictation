import { createWorker } from 'tesseract.js'

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z']/g, '')
}

function extractWordsFromText(text: string): string[] {
  return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [])
    .map(normalizeWord)
    .filter((w) => w.length >= 1)
}

/** Align OCR words to expected list in order (greedy). */
export function gradeWords(
  expected: string[],
  ocrWords: string[],
): Array<{ expected: string; written: string; correct: boolean }> {
  const remaining = [...ocrWords]
  return expected.map((exp) => {
    const target = normalizeWord(exp)
    const idx = remaining.findIndex((w) => w === target)
    if (idx >= 0) {
      const written = remaining[idx]
      remaining.splice(idx, 1)
      return { expected: exp, written, correct: true }
    }
    // fuzzy: close Levenshtein for short typos
    let bestIdx = -1
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = levenshtein(target, remaining[i])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    if (bestIdx >= 0 && bestDist <= Math.max(1, Math.floor(target.length / 4))) {
      const written = remaining[bestIdx]
      remaining.splice(bestIdx, 1)
      return { expected: exp, written, correct: written === target }
    }
    const guess = remaining.shift() || ''
    return { expected: exp, written: guess, correct: false }
  })
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

export async function ocrImage(file: File): Promise<string[]> {
  const worker = await createWorker('eng')
  try {
    const {
      data: { text },
    } = await worker.recognize(file)
    return extractWordsFromText(text)
  } finally {
    await worker.terminate()
  }
}
