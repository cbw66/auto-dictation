export type Accent = 'en-US' | 'en-GB'
export type SpeakRate = 0.6 | 0.8 | 1.0

export type SpeechSettings = {
  accent: Accent
  rate: SpeakRate
  /** How many times to speak each word */
  repeats: 1 | 2
  /** Pause between words when auto-advancing (ms) */
  intervalMs: number
  /** Automatically play next word after finishing current */
  autoAdvance: boolean
}

const KEY = 'echowrite_speech_settings'

export const DEFAULT_SPEECH_SETTINGS: SpeechSettings = {
  accent: 'en-US',
  rate: 0.8,
  repeats: 1,
  intervalMs: 1200,
  autoAdvance: false,
}

export function loadSpeechSettings(): SpeechSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SPEECH_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<SpeechSettings>
    return {
      accent: parsed.accent === 'en-GB' ? 'en-GB' : 'en-US',
      rate: ([0.6, 0.8, 1.0] as SpeakRate[]).includes(parsed.rate as SpeakRate)
        ? (parsed.rate as SpeakRate)
        : 0.8,
      repeats: parsed.repeats === 2 ? 2 : 1,
      intervalMs: [800, 1200, 1800, 2500].includes(Number(parsed.intervalMs))
        ? Number(parsed.intervalMs)
        : 1200,
      autoAdvance: Boolean(parsed.autoAdvance),
    }
  } catch {
    return { ...DEFAULT_SPEECH_SETTINGS }
  }
}

export function saveSpeechSettings(settings: SpeechSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
