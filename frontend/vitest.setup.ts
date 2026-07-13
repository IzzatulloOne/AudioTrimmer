// Подключает матчеры вроде toBeInTheDocument()
import "@testing-library/jest-dom/vitest"

// Автоочистка DOM между тестами
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
})
