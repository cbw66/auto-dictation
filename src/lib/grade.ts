import { createWorker, PSM } from 'tesseract.js'

function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .trim()
    .replace(/[^a-z']/g, '')
}

/** Common OCR confusions for handwritten / printed English. */
function ocrNormalize(w: string): string {
  return normalizeWord(w)
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b')
    .replace(/\|/g, 'l')
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
}

function extractWordsFromText(text: string): string[] {
  return (text.match(/[A-Za-z0-9|'’]+/g) || [])
    .map((w) => w.replace(/[’']/g, "'"))
    .map(ocrNormalize)
    .filter((w) => w.length >= 1)
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

function similarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const d = levenshtein(a, b)
  return 1 - d / Math.max(a.length, b.length)
}

function isCloseMatch(expected: string, written: string): boolean {
  const a = ocrNormalize(expected)
  const b = ocrNormalize(written)
  if (!a || !b) return false
  if (a === b) return true
  // Allow tiny OCR noise on longer words only — short words must be exact
  const maxDist = a.length <= 4 ? 0 : a.length <= 7 ? 1 : 2
  return levenshtein(a, b) <= maxDist && similarity(a, b) >= 0.82
}

/**
 * Sequence-aware grading: prefer order-preserving matches so OCR noise
 * doesn't steal later answers.
 */
export function gradeWords(
  expected: string[],
  ocrWords: string[],
): Array<{ expected: string; written: string; correct: boolean }> {
  const results: Array<{ expected: string; written: string; correct: boolean }> = []
  let cursor = 0

  for (const exp of expected) {
    const target = ocrNormalize(exp)
    let bestIdx = -1
    let bestScore = -1

    const searchEnd = Math.min(ocrWords.length, cursor + 5)
    for (let i = cursor; i < searchEnd; i++) {
      const cand = ocrWords[i]
      if (!cand) continue
      if (cand === target) {
        bestIdx = i
        bestScore = 1
        break
      }
      const score = similarity(target, cand)
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx >= 0 && isCloseMatch(exp, ocrWords[bestIdx])) {
      // Treat OCR-near matches as correct so photo glare / stroke noise
      // does not fail a word the student actually wrote right.
      results.push({
        expected: exp,
        written: ocrWords[bestIdx],
        correct: true,
      })
      cursor = bestIdx + 1
      continue
    }

    // Fall back: exact / near search in remaining list (out-of-order OCR)
    let nearIdx = -1
    for (let i = cursor; i < ocrWords.length; i++) {
      if (isCloseMatch(exp, ocrWords[i])) {
        nearIdx = i
        break
      }
    }
    if (nearIdx >= 0) {
      results.push({ expected: exp, written: ocrWords[nearIdx], correct: true })
      cursor = nearIdx + 1
      continue
    }

    const written = ocrWords[cursor] || ''
    results.push({
      expected: exp,
      written,
      correct: false,
    })
    if (written) cursor += 1
  }

  return results
}

type PrepMode = 'binary' | 'contrast'

async function preprocessImage(file: File, mode: PrepMode): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const maxSide = 2400
  const scale = Math.min(2.4, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)

  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    sum += gray
  }
  const mean = sum / (data.length / 4)
  const threshold = Math.max(105, Math.min(175, mean * 0.9))

  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    if (mode === 'binary') {
      const stretched = Math.max(0, Math.min(255, (gray - mean) * 1.45 + mean))
      const v = stretched > threshold ? 255 : 0
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
    } else {
      // High-contrast grayscale keeps thin pen strokes better than hard binary
      const stretched = Math.max(0, Math.min(255, (gray - mean) * 1.7 + 128))
      data[i] = stretched
      data[i + 1] = stretched
      data[i + 2] = stretched
    }
  }
  ctx.putImageData(image, 0, 0)

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), 'image/png')
  })
}

async function recognizePass(
  worker: Awaited<ReturnType<typeof createWorker>>,
  image: Blob,
  psm: PSM,
): Promise<string[]> {
  await worker.setParameters({
    tessedit_char_whitelist: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'",
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: '1',
  })
  const {
    data: { text },
  } = await worker.recognize(image)
  return extractWordsFromText(text)
}

function scoreWordList(words: string[]): number {
  // Prefer lists with more alphabetic tokens of typical word length
  return words.reduce((score, w) => {
    if (w.length >= 2 && w.length <= 16) return score + 2
    if (w.length === 1) return score + 0.2
    return score + 0.5
  }, 0)
}

export async function ocrImage(file: File): Promise<string[]> {
  const [binary, contrast] = await Promise.all([
    preprocessImage(file, 'binary'),
    preprocessImage(file, 'contrast'),
  ])

  const worker = await createWorker('eng', 1, {
    logger: () => undefined,
  })

  try {
    const passes: string[][] = [
      await recognizePass(worker, contrast, PSM.SPARSE_TEXT),
      await recognizePass(worker, binary, PSM.SPARSE_TEXT),
    ]

    const bestSoFar = [...passes].sort((a, b) => scoreWordList(b) - scoreWordList(a))[0] || []
    if (bestSoFar.length < 5) {
      passes.push(await recognizePass(worker, contrast, PSM.AUTO))
      passes.push(await recognizePass(worker, binary, PSM.SINGLE_BLOCK))
    }

    passes.sort((a, b) => scoreWordList(b) - scoreWordList(a))
    return passes[0] || []
  } finally {
    await worker.terminate()
  }
}
