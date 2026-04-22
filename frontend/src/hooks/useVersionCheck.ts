import { useState, useEffect, useRef } from 'react'

// Injected at build time by Vite
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __GIT_HASH__: string

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''
export const GIT_HASH = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev'

// Checar a cada 3 minutos enquanto a aba está ativa
const CHECK_INTERVAL_MS = 3 * 60 * 1000
// Após detectar nova versão, aguardar este tempo antes de recarregar automaticamente
const AUTO_RELOAD_DELAY_MS = 5_000

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    // Cache-busting duplo: query string + headers
    const res = await fetch(`/?_v=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
    })
    if (!res.ok) return null
    const html = await res.text()
    // Extrai hash do bundle JS (ex: /assets/index-AbCdEfGh.js)
    const match = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Hash local do bundle JS carregado nesta sessão
function getLocalHash(): string | null {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
  for (const s of scripts) {
    const match = s.src.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/)
    if (match) return match[1]
  }
  return null
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const localHash = useRef<string | null>(getLocalHash())
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const triggerUpdate = () => {
    if (updateAvailable) return // já detectado
    setUpdateAvailable(true)
    // Contagem regressiva para auto-reload
    let secs = Math.round(AUTO_RELOAD_DELAY_MS / 1000)
    setCountdown(secs)
    countdownInterval.current = setInterval(() => {
      secs -= 1
      setCountdown(secs)
      if (secs <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current)
      }
    }, 1000)
    reloadTimer.current = setTimeout(() => {
      window.location.reload()
    }, AUTO_RELOAD_DELAY_MS)
  }

  useEffect(() => {
    let cancelled = false

    async function check() {
      if (updateAvailable) return
      const remote = await fetchRemoteVersion()
      if (!cancelled && remote && localHash.current && remote !== localHash.current) {
        triggerUpdate()
      }
    }

    // Checar periodicamente
    const timer = setInterval(check, CHECK_INTERVAL_MS)

    // Primeira checagem após 30s
    const initial = setTimeout(check, 30_000)

    // Checar quando o usuário volta à aba (Page Visibility API)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    // Checar quando o usuário volta ao foco da janela
    window.addEventListener('focus', check)

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(initial)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      if (countdownInterval.current) clearInterval(countdownInterval.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [updateAvailable])

  return { updateAvailable, countdown, version: APP_VERSION, buildTime: BUILD_TIME, gitHash: GIT_HASH }
}
