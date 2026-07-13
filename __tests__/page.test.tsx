import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

function DummyPage() {
  return <h1>AudioTrimmer</h1>
}

test('Отрисовка главного заголовка', () => {
  render(<DummyPage />)
  const heading = screen.getByRole('heading', { name: /audiotrimmer/i })
  expect(heading).toBeInTheDocument()
})
