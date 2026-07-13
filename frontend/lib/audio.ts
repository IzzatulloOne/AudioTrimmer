// Time formatting helpers ---------------------------------------------------

/** mm:ss.d  (e.g. 01:23.4) — matches the data-content="00:00.0" style */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const d = Math.floor((seconds * 10) % 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`
}

/** hh:mm:ss — the format the /trim backend expects */
export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
}

// Waveform peak extraction ---------------------------------------------------

/** Reduce an AudioBuffer to `buckets` normalized min/max peaks for drawing. */
export function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const blockSize = Math.max(1, Math.floor(length / buckets))
  const peaks: number[] = new Array(buckets).fill(0)

  for (let b = 0; b < buckets; b++) {
    const start = b * blockSize
    let max = 0
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c)
      const end = Math.min(start + blockSize, length)
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i])
        if (v > max) max = v
      }
    }
    peaks[b] = max
  }

  // Normalize
  const globalMax = Math.max(...peaks, 0.0001)
  return peaks.map((p) => p / globalMax)
}

// WAV encoding (client-side trim & export) -----------------------------------

/** Slice an AudioBuffer between start/end seconds into a new AudioBuffer. */
export function sliceBuffer(
  ctx: AudioContext | OfflineAudioContext,
  buffer: AudioBuffer,
  start: number,
  end: number,
): AudioBuffer {
  const rate = buffer.sampleRate
  const startSample = Math.max(0, Math.floor(start * rate))
  const endSample = Math.min(buffer.length, Math.floor(end * rate))
  const frames = Math.max(1, endSample - startSample)
  const out = ctx.createBuffer(buffer.numberOfChannels, frames, rate)

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0; i < frames; i++) dst[i] = src[startSample + i]
  }
  return out
}

/** Encode an AudioBuffer to a 16-bit PCM WAV Blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const bufferSize = 44 + dataSize
  const arrayBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, dataSize, true)

  // Interleave channels
  let offset = 44
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]))
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, sample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" })
}
