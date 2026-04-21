import { useState, useEffect, useRef } from 'react'

// Injected at build time by Vite
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __GIT_HASH__: string

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''
export const GIT_HASH = typeof __GIT_HASH__ !== 'undefined' ? __GIT_HASH__ : 'dev'

const CHECK_INTERVAL_MS = 2 * 60 * 1000 // checar a cada 2 minutos

async function fetchRemoteVersion(): Promise<string | null> {
  try {
    // Busca o index.html com cache-busting; o hash do bundle muda a cada deploy
    const res = await fetch(`/?_v=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    const html = await res.text()

    // Extrai o hash do arquivo main JS gerado pelo Vite (ex: /assets/index-AbCdEfGh.js)
    const match = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

// Hash local (extraído da tag <script> já carregada na página)
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
  const localHash = useRef<string | null>(getLocalHash())

  useEffect(() => {
    let cancelled = false

    async function check() {
      const remote = await fetchRemoteVersion()
      if (!cancelled && remote && localHash.current && remote !== localHash.current) {
        setUpdateAvailable(true)
      }
    }

    const timer = setInterval(check, CHECK_INTERVAL_MS)

    // Primeira checagem após 30s (dar tempo do app carregar tudo)
    const initial = setTimeout(check, 30_000)

    return () => {
      cancelled = true
      clearInterval(timer)
      clearTimeout(initial)
    }
  }, [])

  return { updateAvailable, version: APP_VERSION, buildTime: BUILD_TIME, gitHash: GIT_HASH }
}
