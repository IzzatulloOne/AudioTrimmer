"use client"

import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Music2,
  Pause,
  Play,
  Scissors,
  UploadCloud,
} from "lucide-react"
import {
  computePeaks,
  encodeWav,
  formatClock,
  formatTime,
  sliceBuffer,
} from "@/lib/audio"

type Handle = "A" | "B" | "playhead"

const PEAK_RESOLUTION = 2400
const MIN_GAP = 0.1 // seconds
const HOLD_MS = 320

export function AudioTrimmer() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [active, setActive] = useState<Handle>("A")
  const [dragging, setDragging] = useState<Handle | null>(null)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const playRef = useRef<{ ctxStart: number; offset: number } | null>(null)

  // dblclick alternates between placing A and B
  const abToggle = useRef(0)
  // key-hold tracking
  const holdTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const holdFired = useRef<Record<string, boolean>>({})

  const startRef = useRef(0)
  const endRef = useRef(0)
  const playheadRef = useRef(0)
  useEffect(() => {
    startRef.current = start
  }, [start])
  useEffect(() => {
    endRef.current = end
  }, [end])
  useEffect(() => {
    playheadRef.current = playhead
  }, [playhead])

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return audioCtxRef.current
  }, [])

  // --- File loading --------------------------------------------------------
  const loadFile = useCallback(
    async (file: File) => {
      setError(null)
      setStatus(null)
      setLoading(true)
      stopPlayback()
      try {
        const ctx = getCtx()
        const arrayBuffer = await file.arrayBuffer()
        const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
        bufferRef.current = buffer
        setFileName(file.name)
        setDuration(buffer.duration)
        setPeaks(computePeaks(buffer, PEAK_RESOLUTION))
        setStart(0)
        setEnd(buffer.duration)
        setPlayhead(0)
        abToggle.current = 0
      } catch {
        setError("Не удалось прочитать этот файл. Поддерживаются mp3, wav, m4a, ogg и другие аудиоформаты.")
        setFileName(null)
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getCtx],
  )

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  const [dragOver, setDragOver] = useState(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  // --- Playback ------------------------------------------------------------
  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null
        sourceRef.current.stop()
      } catch {}
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    playRef.current = null
    setIsPlaying(false)
  }, [])

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current
    if (!ctx || !playRef.current) return
    const elapsed = ctx.currentTime - playRef.current.ctxStart
    const pos = playRef.current.offset + elapsed
    if (pos >= endRef.current) {
      setPlayhead(endRef.current)
      stopPlayback()
      return
    }
    setPlayhead(pos)
    rafRef.current = requestAnimationFrame(tick)
  }, [stopPlayback])

  const play = useCallback(() => {
    const buffer = bufferRef.current
    if (!buffer) return
    const ctx = getCtx()
    if (ctx.state === "suspended") ctx.resume()
    stopPlayback()

    let offset = playheadRef.current
    if (offset < startRef.current || offset >= endRef.current - 0.02) {
      offset = startRef.current
    }
    const dur = Math.max(0.02, endRef.current - offset)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.onended = () => {
      if (sourceRef.current === src) stopPlayback()
    }
    src.start(0, offset, dur)
    sourceRef.current = src
    playRef.current = { ctxStart: ctx.currentTime, offset }
    setIsPlaying(true)
    rafRef.current = requestAnimationFrame(tick)
  }, [getCtx, stopPlayback, tick])

  const togglePlay = useCallback(() => {
    if (isPlaying) stopPlayback()
    else play()
  }, [isPlaying, play, stopPlayback])

  // --- Position helpers ----------------------------------------------------
  const clampA = (v: number) => Math.max(0, Math.min(v, endRef.current - MIN_GAP))
  const clampB = (v: number) => Math.min(duration, Math.max(v, startRef.current + MIN_GAP))

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || duration === 0) return 0
      const rect = track.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return frac * duration
    },
    [duration],
  )

  // --- Pointer dragging ----------------------------------------------------
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const t = timeFromClientX(e.clientX)
      if (dragging === "A") {
        setStart(clampA(t))
        setPlayhead(clampA(t))
      } else if (dragging === "B") {
        setEnd(clampB(t))
        setPlayhead(clampB(t))
      } else {
        setPlayhead(Math.max(0, Math.min(duration, t)))
      }
    }
    const onUp = () => setDragging(null)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, duration, timeFromClientX])

  const onTrackPointerDown = (e: React.PointerEvent) => {
    if (duration === 0) return
    // clicking empty track moves the playhead
    const t = timeFromClientX(e.clientX)
    setPlayhead(Math.max(0, Math.min(duration, t)))
    setActive("playhead")
    setDragging("playhead")
    trackRef.current?.focus()
  }

  const onTrackDoubleClick = (e: React.MouseEvent) => {
    if (duration === 0) return
    const t = timeFromClientX(e.clientX)
    if (abToggle.current % 2 === 0) {
      setStart(Math.max(0, Math.min(t, endRef.current - MIN_GAP)))
      setActive("A")
    } else {
      setEnd(Math.min(duration, Math.max(t, startRef.current + MIN_GAP)))
      setActive("B")
    }
    abToggle.current += 1
    setPlayhead(t)
  }

  // --- Keyboard ------------------------------------------------------------
  const nudge = useCallback(
    (dir: -1 | 1, big: boolean) => {
      const step = big ? 1 : 0.1
      if (active === "A") setStart((s) => clampA(s + dir * step))
      else if (active === "B") setEnd((eV) => clampB(eV + dir * step))
      else setPlayhead((p) => Math.max(0, Math.min(duration, p + dir * step)))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, duration],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (duration === 0) return
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault()
        nudge(-1, e.shiftKey)
        break
      case "ArrowRight":
        e.preventDefault()
        nudge(1, e.shiftKey)
        break
      case " ":
        e.preventDefault()
        togglePlay()
        break
      case "1":
      case "2": {
        if (e.repeat) return
        const key = e.key
        holdFired.current[key] = false
        holdTimers.current[key] = setTimeout(() => {
          holdFired.current[key] = true
          // hold → mark trim boundary at current playhead
          if (key === "1") {
            setStart(clampA(playheadRef.current))
            setActive("A")
          } else {
            setEnd(clampB(playheadRef.current))
            setActive("B")
          }
        }, HOLD_MS)
        break
      }
      default:
        break
    }
  }

  const onKeyUp = (e: React.KeyboardEvent) => {
    const key = e.key
    if (key === "1" || key === "2") {
      const timer = holdTimers.current[key]
      if (timer) clearTimeout(timer)
      holdTimers.current[key] = null
      if (!holdFired.current[key]) {
        // tap → jump playhead to start / end
        setPlayhead(key === "1" ? 0 : duration)
        setActive("playhead")
      }
    }
  }

  // --- Canvas drawing ------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const track = trackRef.current
    if (!canvas || !track) return
    const rect = track.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = rect.height
    if (w === 0 || h === 0) return
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const styles = getComputedStyle(track)
    const cIdle = styles.getPropertyValue("--waveform").trim() || "rgba(150,150,160,0.4)"
    const cActive = styles.getPropertyValue("--waveform-active").trim() || "#4a90e2"

    const mid = h / 2
    const barW = 2
    const gap = 1
    const count = Math.floor(w / (barW + gap))
    const perBar = peaks.length / count

    for (let i = 0; i < count; i++) {
      const x = i * (barW + gap)
      const t = (i / count) * duration
      const inSel = t >= start && t <= end
      // average the peaks covered by this bar
      let sum = 0
      let n = 0
      const from = Math.floor(i * perBar)
      const to = Math.floor((i + 1) * perBar)
      for (let p = from; p < to && p < peaks.length; p++) {
        sum += peaks[p]
        n++
      }
      const amp = n ? sum / n : peaks[from] || 0
      const barH = Math.max(2, amp * (h * 0.86))
      ctx.fillStyle = inSel ? cActive : cIdle
      ctx.globalAlpha = inSel ? 1 : 0.5
      ctx.beginPath()
      const r = barW / 2
      const top = mid - barH / 2
      ctx.roundRect(x, top, barW, barH, r)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [peaks, duration, start, end])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener("resize", onResize)
    // redraw on theme change
    const obs = new MutationObserver(() => draw())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => {
      window.removeEventListener("resize", onResize)
      obs.disconnect()
    }
  }, [draw])

  useEffect(() => {
    return () => {
      stopPlayback()
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      if (ctx && ctx.state !== "closed") {
        // close() can reject/throw if the context is already closing (e.g. StrictMode remount)
        void Promise.resolve(ctx.close()).catch(() => {})
      }
    }
  }, [stopPlayback])

  // --- Export / trim -------------------------------------------------------
  const handleTrim = useCallback(async () => {
    const buffer = bufferRef.current
    if (!buffer) return
    setExporting(true)
    setStatus(null)
    try {
      const ctx = getCtx()
      const sliced = sliceBuffer(ctx, buffer, start, end)
      const wav = encodeWav(sliced)

      // download the trimmed audio (real, client-side result)
      const url = URL.createObjectURL(wav)
      const a = document.createElement("a")
      const base = (fileName || "audio").replace(/\.[^.]+$/, "")
      a.href = url
      a.download = `${base}_trim_${formatClock(start).replace(/:/g, "-")}.wav`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      // notify the backend hook (/api/trim) with the A/B markers
      try {
        const fd = new FormData()
        fd.append("file", new File([wav], a.download, { type: "audio/wav" }))
        fd.append("start_time", formatClock(start))
        fd.append("end_time", formatClock(end))
        const res = await fetch("/api/trim", { method: "POST", body: fd })
        if (res.ok) setStatus(`Готово · вырезано ${formatTime(end - start)} и отправлено на /trim`)
        else setStatus(`Файл скачан · бэкенд /trim ответил ${res.status}`)
      } catch {
        setStatus("Файл скачан локально (бэкенд /trim недоступен)")
      }
    } catch {
      setError("Не удалось обрезать аудио.")
    } finally {
      setExporting(false)
    }
  }, [start, end, fileName, getCtx])

  // --- Derived positions ---------------------------------------------------
  const pct = (t: number) => (duration ? (t / duration) * 100 : 0)
  const hasAudio = duration > 0

  return (
    <div className="w-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Music2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {fileName ?? "Файл не выбран"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {hasAudio ? `${formatTime(duration)} · всего` : "Загрузите аудио, чтобы начать"}
            </p>
          </div>
        </div>

        <label className="group inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground backdrop-blur transition-all duration-300 hover:border-primary/40 hover:bg-card active:scale-[0.98]">
          <UploadCloud className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
          {hasAudio ? "Заменить" : "Выбрать файл"}
          <input type="file" accept="audio/*" className="sr-only" onChange={onFileInput} />
        </label>
      </div>

      {/* Dropzone (no audio) */}
      {!hasAudio && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center transition-all duration-500 ease-out ${
            dragOver
              ? "border-primary/60 bg-primary/8 scale-[1.01]"
              : "border-border bg-card/40"
          }`}
        >
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
          )}
          <p className="mt-4 text-sm font-medium text-foreground">
            {loading ? "Декодирую аудио…" : "Перетащите аудиофайл сюда"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">m4a · ogg · flac</p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Waveform + trimmer */}
      {hasAudio && (
        <div className="mt-6 animate-fade-up">
          {/* time ruler */}
          <div className="mb-2 flex justify-between font-mono text-[11px] text-muted-foreground">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i}>{formatTime((duration * i) / 4)}</span>
            ))}
          </div>

          <div className="relative select-none">
            <div
              ref={trackRef}
              tabIndex={0}
              role="slider"
              aria-label="Аудио дорожка"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(playhead)}
              onPointerDown={onTrackPointerDown}
              onDoubleClick={onTrackDoubleClick}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
              className="relative h-40 w-full cursor-text touch-none overflow-hidden rounded-2xl border border-border bg-card/50 outline-none ring-primary/50 transition-shadow focus-visible:ring-2"
            >
              {/* dim outside selection */}
              <div
                className={`pointer-events-none absolute inset-y-0 left-0 bg-background/55 ${dragging ? "" : "transition-[width] duration-100"}`}
                style={{ width: `${pct(start)}%` }}
              />
              <div
                className={`pointer-events-none absolute inset-y-0 right-0 bg-background/55 ${dragging ? "" : "transition-[width] duration-100"}`}
                style={{ width: `${100 - pct(end)}%` }}
              />

              {/* selection outline */}
              <div
                className={`pointer-events-none absolute inset-y-0 border-x-2 border-primary/50 bg-primary/[0.04] ${dragging ? "" : "transition-all duration-100"}`}
                style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
              />

              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

              {/* Point A marker */}
              <Marker
                pos={pct(start)}
                color="var(--pointA)"
                label="A"
                time={formatTime(start)}
                active={active === "A"}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setActive("A")
                  setDragging("A")
                  trackRef.current?.focus()
                }}
              />

              {/* Point B marker */}
              <Marker
                pos={pct(end)}
                color="var(--pointB)"
                label="B"
                time={formatTime(end)}
                active={active === "B"}
                alignRight
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setActive("B")
                  setDragging("B")
                  trackRef.current?.focus()
                }}
              />

              {/* Playhead cursor — tooltip only while playing or scrubbing */}
              <div
                className={`pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-foreground/80 ${dragging ? "" : "transition-[left] duration-75"}`}
                style={{ left: `${pct(playhead)}%` }}
              >
                <div
                  data-content={formatTime(playhead)}
                  className={`inner absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-semibold text-background shadow-sm transition-opacity duration-200 before:content-[attr(data-content)] ${
                    isPlaying || dragging === "playhead" ? "opacity-100" : "opacity-0"
                  }`}
                />
                <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-foreground" />
              </div>
            </div>
          </div>

          {/* Fine controls */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <TimeField
              label="Начало (A)"
              accent="var(--pointA)"
              value={start}
              active={active === "A"}
              onFocus={() => setActive("A")}
              onStep={(d) => setStart(clampA(start + d))}
            />
            <TimeField
              label="Длительность"
              accent="var(--primary)"
              value={end - start}
              readOnly
              highlight
            />
            <TimeField
              label="Конец (B)"
              accent="var(--pointB)"
              value={end}
              active={active === "B"}
              onFocus={() => setActive("B")}
              onStep={(d) => setEnd(clampB(end + d))}
              alignRight
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-secondary px-5 text-sm font-medium text-secondary-foreground transition-all duration-300 hover:brightness-110 active:scale-[0.98]"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Пауза" : "Слушать фрагмент"}
            </button>

            <button
              type="button"
              onClick={handleTrim}
              disabled={exporting}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scissors className="h-4 w-4" />
              )}
              Обрезать и скачать
              {!exporting && <Download className="h-4 w-4 opacity-70" />}
            </button>

            {status && (
              <span className="text-xs text-muted-foreground animate-fade-up">{status}</span>
            )}
          </div>

          {/* Hotkeys hint */}
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-border bg-card/40 px-4 py-3 text-xs text-muted-foreground">
            <Hint keys={["←", "→"]} text="сдвинуть активную точку (Shift — на 1 с)" />
            <Hint keys={["1"]} text="нажать — в начало · удержать — точка A" />
            <Hint keys={["2"]} text="нажать — в конец · удержать — точка B" />
            <Hint keys={["Space"]} text="воспроизведение" />
            <Hint keys={["dbl"]} text="двойной клик — поставить A, затем B" />
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---------------------------------------------------------

function Marker({
  pos,
  color,
  label,
  time,
  active,
  alignRight,
  onPointerDown,
}: {
  pos: number
  color: string
  label: string
  time: string
  active: boolean
  alignRight?: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute top-0 bottom-0 z-30 flex w-4 -translate-x-1/2 cursor-ew-resize touch-none items-start justify-center"
      style={{ left: `${pos}%` }}
    >
      <div
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-all duration-100"
        style={{ background: color, boxShadow: active ? `0 0 12px ${color}` : "none" }}
      />
      <div
        className={`absolute bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-background transition-transform duration-200 ${
          active ? "scale-110" : "scale-100"
        }`}
        style={{ background: color }}
      >
        {label}
      </div>
      <div
        className={`absolute -top-6 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold text-background transition-opacity duration-200 ${
          active ? "opacity-100" : "opacity-0"
        } ${alignRight ? "right-0" : "left-0"}`}
        style={{ background: color }}
      >
        {time}
      </div>
    </div>
  )
}

function TimeField({
  label,
  value,
  accent,
  active,
  readOnly,
  highlight,
  alignRight,
  onFocus,
  onStep,
}: {
  label: string
  value: number
  accent: string
  active?: boolean
  readOnly?: boolean
  highlight?: boolean
  alignRight?: boolean
  onFocus?: () => void
  onStep?: (delta: number) => void
}) {
  return (
    <div
      onClick={onFocus}
      className={`rounded-xl border px-4 py-3 transition-all duration-300 ${
        highlight
          ? "border-primary/40 bg-primary/10"
          : active
            ? "border-primary/50 bg-card"
            : "border-border bg-card/50"
      } ${readOnly ? "" : "cursor-pointer"} ${alignRight ? "text-right" : ""}`}
    >
      <div className={`flex items-center gap-1.5 ${alignRight ? "justify-end" : ""}`}>
        <span className="h-2 w-2 rounded-full" style={{ background: accent }} />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-1.5 flex items-center gap-2 ${alignRight ? "justify-end" : ""}`}>
        {!readOnly && onStep && (
          <button
            type="button"
            aria-label="Назад"
            onClick={(e) => {
              e.stopPropagation()
              onStep(-0.1)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-90"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {formatTime(value)}
        </span>
        {!readOnly && onStep && (
          <button
            type="button"
            aria-label="Вперёд"
            onClick={(e) => {
              e.stopPropagation()
              onStep(0.1)
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-90"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Hint({ keys, text }: { keys: string[]; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1.5 font-mono text-[10px] font-semibold text-secondary-foreground"
        >
          {k}
        </kbd>
      ))}
      <span>{text}</span>
    </span>
  )
}
