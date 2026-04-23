import { createApp, watch } from 'vue'
import router from '@/router'
import '@/assets/css/tailwind.css'
import '@/assets/css/index.sass'
import { createI18n } from 'vue-i18n'
import {
  loadLocaleMessages,
  resolveInitialLocale,
  setI18nLocale,
  isSupportedLocale
} from '@/i18n'
import { GAME_USER_LANGUAGE } from '@/utils/constants.ts'
import { LANGUAGES } from '@/utils/enums'
import { initCrazyGames, crazyLocale } from '@/use/useCrazyGames'
import useUser, { isCrazyWeb, isWaveDash } from '@/use/useUser'
import { isDebug } from '@/use/useMatch.ts'

const bootstrap = async () => {
  // Platform SDK init — must happen before App loads.
  if (isCrazyWeb) {
    await initCrazyGames()
  } else if (isWaveDash) {
    try {
      const sdk = await (window as any).WavedashJS
      if (sdk) await sdk.init({ debug: isDebug.value })
    } catch (e) {
      console.warn('[Wavedash] SDK init failed:', e)
    }
  }

  // If CrazyGames reported a supported player locale, persist it as the
  // session hint so resolveInitialLocale picks it up below and every
  // subsequent boot in this tab stays consistent with the portal's
  // preference rather than a stale browser default.
  const cgLocale = crazyLocale.value
  if (cgLocale && LANGUAGES.includes(cgLocale)) {
    sessionStorage.setItem(GAME_USER_LANGUAGE, cgLocale)
  }

  const { default: App } = await import('@/App.vue')

  // Resolve and LOAD just the initial locale bundle before creating the
  // i18n instance. The English fallback is loaded in parallel so missing
  // keys are never undefined while the active locale's chunk is still
  // in flight. If the initial locale IS English we only fetch once.
  const initial = resolveInitialLocale(GAME_USER_LANGUAGE)
  const needsFallback = initial !== 'en'
  const [initialMsgs, fallbackMsgs] = await Promise.all([
    loadLocaleMessages(initial).catch(() => ({})),
    needsFallback ? loadLocaleMessages('en').catch(() => ({})) : Promise.resolve(null)
  ])

  const i18n: any = createI18n({
    locale: initial,
    fallbackLocale: 'en',
    messages: needsFallback
      ? { [initial]: initialMsgs, en: fallbackMsgs ?? {} }
      : { en: initialMsgs },
    missingWarn: false,
    fallbackWarn: false
  })

  // If the SDK gave us a supported locale, push it through the user store
  // so userLanguage (and anything reactive to it) lines up with i18n. We
  // wait for IndexedDB hydration so we don't race with the saved-
  // preference loader and end up writing then immediately overwriting.
  if (cgLocale && LANGUAGES.includes(cgLocale)) {
    const { userLanguage: storedLanguage, setSettingValue } = useUser()
    const { isDbInitialized } = await import('@/use/useMatch')
    let stop: (() => void) | null = null
    stop = watch(
      isDbInitialized,
      (ready) => {
        if (!ready) return
        stop?.()
        if (storedLanguage.value !== cgLocale) {
          setSettingValue('language', cgLocale)
        }
        // cgLocale is the one we already loaded above, so this is a
        // cheap no-op on the loader side.
        setI18nLocale(i18n, cgLocale)
      },
      { immediate: true }
    )
  }

  // Sync i18n locale when IndexedDB hydrates the saved language on reload
  // (skip when CrazyGames already controls locale). If the hydrated
  // locale differs from what we booted with, `setI18nLocale` will fetch
  // the new chunk on-the-fly before swapping.
  if (!(cgLocale && LANGUAGES.includes(cgLocale))) {
    const { userLanguage: storedLang } = useUser()
    const { isDbInitialized: dbReady } = await import('@/use/useMatch')
    let stopLangSync: (() => void) | null = null
    stopLangSync = watch(
      dbReady,
      (ready) => {
        if (!ready) return
        stopLangSync?.()
        if (isSupportedLocale(storedLang.value)) {
          setI18nLocale(i18n, storedLang.value)
        }
      },
      { immediate: true }
    )
  }

  // Expose the instance globally so composables / skills that want to
  // trigger a runtime locale switch (e.g. OptionsModal) can resolve the
  // active i18n without prop-drilling.
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
