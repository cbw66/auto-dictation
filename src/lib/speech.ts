export function speakWord(word: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(word)
    utter.lang = 'en-US'
    utter.rate = 0.9
    const voices = window.speechSynthesis.getVoices()
    const en =
      voices.find((v) => v.lang.startsWith('en') && /US|UK|GB/i.test(v.lang)) ||
      voices.find((v) => v.lang.startsWith('en'))
    if (en) utter.voice = en
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.speak(utter)
  })
}

export function preloadVoices() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices()
  }
}
