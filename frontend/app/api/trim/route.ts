import { NextResponse } from "next/server"

// Backend hook for the trimmer.
// The client already produces the real trimmed WAV via the Web Audio API and
// downloads it directly. This endpoint receives the file + A/B markers so the
// trim can also be processed / stored server-side (e.g. hand off to ffmpeg for
// the upcoming video trim & convert features).
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")
    const startTime = form.get("start_time")
    const endTime = form.get("end_time")

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Файл не получен" }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      name: file.name,
      size: file.size,
      type: file.type,
      start_time: String(startTime ?? ""),
      end_time: String(endTime ?? ""),
      receivedAt: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ ok: false, error: "Ошибка обработки" }, { status: 500 })
  }
}
