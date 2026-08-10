import type { Accent, SpeakRate, SpeechSettings } from './speechSettings'
import { loadSpeechSettings } from './speechSettings'

export type SpeakOptions = {
  accent?: Accent
  rate?: SpeakRate
  repeats?: 1 | 2
}

let requestId = 0
let activeAudio: HTMLAudioElement | null = null

/** Cache dictionary audio URLs: "word|accent" -> url | null (null = known missing) */
const audioUrlCache = new Map<string, string | null>()

function pickVoice(accent: Accent): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const match =
    accent === 'en-GB'
      ? voices.find((v) => /en-GB|en_GB/i.test(v.lang))
      : voices.find((v) => /en-US|en_US/i.test(v.lang))
  return match || voices.find((v) => v.lang.toLowerCase().startsWith('en'))
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function normalizeLookupWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z'-]/g, '')
}

function stopAudio() {
  if (!activeAudio) return
  try {
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
  } catch {
    /* ignore */
  }
  activeAudio = null
}

function youdaoAudioUrl(word: string, accent: Accent): string {
  // type=1 美音, type=2 英音 — 有道词典真人发音
  const type = accent === 'en-GB' ? 2 : 1
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`
}

type Phonetic = { audio?: string; sourceUrl?: string }

async function lookupFreeDictionaryAudio(
  word: string,
  accent: Accent,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    )
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ phonetics?: Phonetic[] }>
    const phonetics = data.flatMap((entry) => entry.phonetics || []).filter((p) => p.audio)

    if (!phonetics.length) return null

    const prefer =
      accent === 'en-GB'
        ? [/uk|gb|british/i, /en-gb/i]
        : [/us|american/i, /en-us/i]

    for (const re of prefer) {
      const hit = phonetics.find((p) => re.test(`${p.audio} ${p.sourceUrl || ''}`))
      if (hit?.audio) return hit.audio
    }

    // Prefer any non-empty audio over nothing
    return phonetics[0]?.audio || null
  } catch {
    return null
  }
}

async function resolveDictionaryAudioUrl(
  word: string,
  accent: Accent,
): Promise<string | null> {
  const key = `${word}|${accent}`
  if (audioUrlCache.has(key)) return audioUrlCache.get(key) ?? null

  // 1) Free Dictionary（牛津/Wiktionary 等真人录音，若有对应口音）
  const free = await lookupFreeDictionaryAudio(word, accent)
  if (free) {
    audioUrlCache.set(key, free)
    return free
  }

  // 2) 有道词典美/英音（覆盖面广，适合听写单词）
  const youdao = youdaoAudioUrl(word, accent)
  audioUrlCache.set(key, youdao)
  return youdao
}

function playAudioUrl(url: string, rate: SpeakRate, myId: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (myId !== requestId) {
      resolve(false)
      return
    }

    stopAudio()
    const audio = new Audio()
    activeAudio = audio
    audio.preload = 'auto'
    audio.playbackRate = rate
    // Keep pitch natural when slowing down (where supported)
    try {
      ;(audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    } catch {
      /* ignore */
    }

    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(watchdog)
      if (activeAudio === audio) activeAudio = null
      resolve(ok)
    }

    const watchdog = window.setTimeout(() => finish(false), 8000)

    audio.onended = () => finish(true)
    audio.onerror = () => finish(false)
    audio.onabort = () => finish(false)

    audio.src = url
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.catch(() => finish(false))
    }
  })
}

function speakOnceSynth(word: string, accent: Accent, rate: SpeakRate): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }

    const text = word.trim()
    if (!text) {
      resolve()
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(watchdog)
      resolve()
    }

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = accent
    utter.rate = rate
    utter.pitch = 1
    utter.volume = 1
    const voice = pickVoice(accent)
    if (voice) utter.voice = voice

    utter.onend = finish
    utter.onerror = finish

    const watchdog = window.setTimeout(finish, Math.max(4000, 1500 + text.length * 400))

    try {
      window.speechSynthesis.speak(utter)
    } catch {
      finish()
    }
  })
}

async function speakOnce(
  word: string,
  accent: Accent,
  rate: SpeakRate,
  myId: number,
): Promise<void> {
  const lookup = normalizeLookupWord(word)
  if (!lookup) return

  const url = await resolveDictionaryAudioUrl(lookup, accent)
  if (myId !== requestId) return

  if (url) {
    const ok = await playAudioUrl(url, rate, myId)
    if (ok || myId !== requestId) return
  }

  // 词典音频失败时回退系统语音
  if (myId !== requestId) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
  await delay(40)
  if (myId !== requestId) return
  await speakOnceSynth(word, accent, rate)
}

function resolveOptions(options?: SpeakOptions | SpeechSettings) {
  const settings = loadSpeechSettings()
  return {
    accent: (options?.accent ?? settings.accent) as Accent,
    rate: (options?.rate ?? settings.rate) as SpeakRate,
    repeats: (options?.repeats ?? settings.repeats) as 1 | 2,
  }
}

/** Prefer dictionary (human) audio; fall back to system TTS. */
export async function speakWord(
  word: string,
  options?: SpeakOptions | SpeechSettings,
): Promise<void> {
  const { accent, rate, repeats } = resolveOptions(options)
  const myId = ++requestId

  stopAudio()
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }

  for (let i = 0; i < repeats; i++) {
    if (myId !== requestId) return
    await speakOnce(word, accent, rate, myId)
    if (i < repeats - 1 && myId === requestId) await delay(220)
  }
}

export function stopSpeaking() {
  requestId += 1
  stopAudio()
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }
}

export function preloadVoices() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices()
    }
  }
}

/** Warm dictionary audio for upcoming words (best-effort). */
export function prefetchWordAudio(words: string[], accent?: Accent) {
  const settings = loadSpeechSettings()
  const acc = accent ?? settings.accent
  for (const raw of words.slice(0, 30)) {
    const word = normalizeLookupWord(raw)
    if (!word) continue
    const key = `${word}|${acc}`
    if (audioUrlCache.has(key)) continue
    void resolveDictionaryAudioUrl(word, acc)
  }
}
