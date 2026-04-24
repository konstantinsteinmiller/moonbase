import { createApp } from 'vue'
import router from '@/router'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import { createI18n } from 'vue-i18n'
import {
  loadLocaleMessages,
  resolveInitialLocale,
  isSupportedLocale
} from '@/i18n'

import { isCrazyWeb, isWaveDash, isItch } from '@/use/useUser.ts'
import { GAME_USER_LANGUAGE } from '@/utils/constants'

const bootstrap = async () => {
  const { default: App } = await import('@/App.vue')

  // Platform SDK init — must happen before App loads.
  if (isCrazyWeb) {
    // await initCrazyGames()
  } else if (isWaveDash) {
    try {
      const sdk = await (window as any).WavedashJS
      if (sdk) await sdk.init({ debug: false })
    } catch (e) {
      console.warn('[Wavedash] SDK init failed:', e)
    }
  }

  const initial = resolveInitialLocale(GAME_USER_LANGUAGE)
  const needsFallback = initial !== 'en'
  const [initialMsgs, fallbackMsgs] = await Promise.all([
    loadLocaleMessages(initial).catch(() => ({})),
    needsFallback ? loadLocaleMessages('en').catch(() => ({})) : Promise.resolve(null)
  ])

  const i18n: any = createI18n({
      locale: isSupportedLocale(initial) ? initial : 'en',
    fallbackLocale: 'en',
    messages: needsFallback
      ? { [initial]: initialMsgs, en: fallbackMsgs ?? {} }
      : { en: initialMsgs },
    missingWarn: false,
      fallbackWarn: false,
      legacy: false
  })

  ;(window as any).__i18n = i18n

  const app = createApp(App)
  app.use(router)
  app.use(i18n)
  app.mount('#app')

  // Signal to Wavedash that the game is fully loaded and ready
  if (isWaveDash) {
    try {
      const sdk = await (window as any).WavedashJS
      if (sdk) {
        sdk.updateLoadProgressZeroToOne?.(1)
        sdk.readyForEvents?.()
      }
    } catch (e) {
      console.warn('[Wavedash] ready signal failed:', e)
    }
  }
}

bootstrap()
