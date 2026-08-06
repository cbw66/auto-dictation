import type { Accent, SpeakRate, SpeechSettings } from './speechSettings'
import { loadSpeechSettings } from './speechSettings'

export type SpeakOptions = {
  accent?: Accent
  rate?: SpeakRate
  repeats?: 1 | 2
}

let requestId = 0

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

/**
 * Mild rate bump for longer words at slow UI rates.
 * Windows/Chrome TTS often pauses inside compounds (land|lord) at 0.6/0.8.
 * Short words keep the user's rate unchanged; 1.0 is never raised.
 */
function effectiveRate(word: string, rate: SpeakRate): number {
  const len = word.replace(/[^a-z']/gi, '').length
  if (len < 6) return rate

  if (len >= 8) {
    if (rate <= 0.6) return 0.88
    if (rate <= 0.8) return 0.94
    return rate
  }
  if (rate <= 0.6) return 0.78
  if (rate <= 0.8) return 0.88
  return rate
}

function speakOnce(word: string, accent: Accent, rate: SpeakRate): Promise<void> {
  return new Promise((resolve) => {
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
    utter.rate = effectiveRate(text, rate)
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

function resolveOptions(options?: SpeakOptions | SpeechSettings) {
  const settings = loadSpeechSettings()
  return {
    accent: (options?.accent ?? settings.accent) as Accent,
    rate: (options?.rate ?? settings.rate) as SpeakRate,
    repeats: (options?.repeats ?? settings.repeats) as 1 | 2,
  }
}

/** Speak a word using current settings. Safe to call again to interrupt / replay. */
export async function speakWord(
  word: string,
  options?: SpeakOptions | SpeechSettings,
): Promise<void> {
  if (!('speechSynthesis' in window)) return

  const { accent, rate, repeats } = resolveOptions(options)
  const myId = ++requestId

  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
  // Short flush so Chrome does not drop the next utterance after cancel
  await delay(50)
  if (myId !== requestId) return

  for (let i = 0; i < repeats; i++) {
    if (myId !== requestId) return
    await speakOnce(word, accent, rate)
    if (i < repeats - 1 && myId === requestId) await delay(250)
  }
}

export function stopSpeaking() {
  requestId += 1
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
  }
}

export function preloadVoices() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices()
  }
}
