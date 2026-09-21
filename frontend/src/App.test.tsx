import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// LocationPicker (rendered by App) uses react-leaflet, which needs real
// layout/canvas that jsdom doesn't provide — mocked here so these tests
// stay focused on the upload flow. See LocationPicker.test.tsx for the
// map/search behavior itself.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  useMapEvents: () => null,
}))
vi.mock('./components/leafletIconFix', () => ({}))

const sampleSummary = {
  reading_count: 192,
  start: '2025-01-01T00:00:00Z',
  end: '2025-01-02T23:45:00Z',
  total_kwh: 136.55,
  average_daily_kwh: 68.275,
  flagged_reading_count: 1,
}

function csvFile() {
  return new File(['irrelevant,for,this,test'], 'consumption.csv', { type: 'text/csv' })
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads a CSV and renders the returned summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleSummary,
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText(/consumption csv/i)
    await user.upload(input, csvFile())
    await user.click(screen.getByRole('button', { name: /upload/i }))

    expect(await screen.findByText('192')).toBeInTheDocument()
    expect(screen.getByText('136.55 kWh')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/consumption/upload'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows the backend error message when the upload is rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: 'Unexpected CSV header' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText(/consumption csv/i)
    await user.upload(input, csvFile())
    await user.click(screen.getByRole('button', { name: /upload/i }))

    await waitFor(() => {
      expect(screen.getByText('Unexpected CSV header')).toBeInTheDocument()
    })
  })
})
