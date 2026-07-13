import { AudioTrimmer } from "@/components/audio-trimmer"
import { ThemeToggle } from "@/components/theme-toggle"

export default function Page() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-14">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-5 w-5"
              aria-hidden="true"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold leading-none tracking-tight text-foreground">
              Media Trimmer
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Аудио · скоро видео и конвертация</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <section className="mt-8 rounded-3xl border border-border bg-card/70 p-5 shadow-2xl shadow-black/5 backdrop-blur-sm sm:p-7">
        <AudioTrimmer />
      </section>

      <footer className="mt-auto pt-10 text-center text-xs text-muted-foreground">
        Точки A/B, горячие клавиши и плавная волна. Перетащите точки или используйте стрелки.
      </footer>
    </main>
  )
}
