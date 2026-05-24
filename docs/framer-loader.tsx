/**
 * Sprite CDN loader for Framer code components.
 *
 * Paste this into a Framer code component (or import from a shared module).
 * Public API:
 *
 *   const { manifest, loading, error } = useSpriteManifest()
 *   const { url, loading, error } = useSprite("sonic-walking-right")
 *
 * Network strategy per sprite:
 *   1. jsDelivr pinned URL  (cdn.jsdelivr.net/gh/...@v1.0.0/...)
 *   2. jsDelivr @main       (works even before the tag is published)
 *   3. statically.io        (cdn.statically.io/gh/.../main/...)
 *   4. raw.githubusercontent.com  (last resort)
 *
 * Every fetch has a 5-second timeout. No infinite hangs.
 */

import { useEffect, useRef, useState } from "react"

const OWNER = "BIBOKING-forever"
const REPO = "Sprites"
const TAG = "v1.0.0"

const MANIFEST_URL = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${TAG}/sprites/manifest.json`
const MANIFEST_LATEST = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@main/sprites/manifest.json`
const MANIFEST_FALLBACK = `https://cdn.statically.io/gh/${OWNER}/${REPO}/main/sprites/manifest.json`
const MANIFEST_LAST_RESORT = `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/sprites/manifest.json`

const TIMEOUT_MS = 5000

export type SpriteEntry = {
    name: string
    character: string
    action: string
    path: string
    url_pinned: string
    url_latest: string
    url_fallback: string
    url_last_resort: string
    width?: number
    height?: number
}

export type SpriteManifest = {
    version: string
    repository: string
    generated: string
    total_sprites: number
    sprites: SpriteEntry[]
}

function fetchWithTimeout(url: string, ms: number): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

async function fetchFirstOk(urls: string[]): Promise<Response> {
    let lastErr: unknown
    for (const url of urls) {
        try {
            const res = await fetchWithTimeout(url, TIMEOUT_MS)
            if (res.ok) return res
            lastErr = new Error(`HTTP ${res.status} from ${url}`)
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr ?? new Error("All sources failed")
}

let manifestPromise: Promise<SpriteManifest> | null = null

function loadManifest(): Promise<SpriteManifest> {
    if (manifestPromise) return manifestPromise
    manifestPromise = fetchFirstOk([
        MANIFEST_URL,
        MANIFEST_LATEST,
        MANIFEST_FALLBACK,
        MANIFEST_LAST_RESORT,
    ])
        .then((r) => r.json())
        .catch((e) => {
            manifestPromise = null
            throw e
        })
    return manifestPromise
}

export function useSpriteManifest() {
    const [manifest, setManifest] = useState<SpriteManifest | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>("")

    useEffect(() => {
        let cancelled = false
        loadManifest()
            .then((m) => {
                if (!cancelled) setManifest(m)
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    return { manifest, loading, error }
}

/**
 * Resolve a sprite by logical name and verify it loads.
 * Returns the first URL (pinned → fallback → last resort) that successfully
 * fetches as an image within the timeout, or an error if all sources fail.
 */
export function useSprite(name: string) {
    const [url, setUrl] = useState<string>("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string>("")
    const objectUrlRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError("")
        setUrl("")

        ;(async () => {
            try {
                const manifest = await loadManifest()
                const entry = manifest.sprites.find((s) => s.name === name)
                if (!entry) throw new Error(`Sprite "${name}" not in manifest`)

                const candidates = [
                    entry.url_pinned,
                    entry.url_latest,
                    entry.url_fallback,
                    entry.url_last_resort,
                ]

                for (const candidate of candidates) {
                    try {
                        // Use HEAD-style probe via Image to avoid CORS issues
                        // on binary fetches while still respecting the timeout.
                        await loadImageWithTimeout(candidate, TIMEOUT_MS)
                        if (!cancelled) {
                            setUrl(candidate)
                            setLoading(false)
                        }
                        return
                    } catch {
                        // try next
                    }
                }
                throw new Error(`All CDN sources failed for "${name}"`)
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : String(e))
                    setLoading(false)
                }
            }
        })()

        return () => {
            cancelled = true
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current)
                objectUrlRef.current = null
            }
        }
    }, [name])

    return { url, loading, error }
}

function loadImageWithTimeout(src: string, ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const timer = setTimeout(() => {
            img.src = ""
            reject(new Error(`Timeout loading ${src}`))
        }, ms)
        img.onload = () => {
            clearTimeout(timer)
            resolve()
        }
        img.onerror = () => {
            clearTimeout(timer)
            reject(new Error(`Failed to load ${src}`))
        }
        img.src = src
    })
}

/**
 * Convenience: resolve a URL synchronously from a preloaded manifest.
 * Falls back through the CDN chain at the URL string level — the consumer
 * (img tag) is responsible for handling onError to try the next URL.
 */
export function getSpriteUrls(manifest: SpriteManifest, name: string): string[] {
    const entry = manifest.sprites.find((s) => s.name === name)
    if (!entry) return []
    return [
        entry.url_pinned,
        entry.url_latest,
        entry.url_fallback,
        entry.url_last_resort,
    ]
}
