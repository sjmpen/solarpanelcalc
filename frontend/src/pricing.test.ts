import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSpotPrices } from './pricing'

describe('fetchSpotPrices', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the given date and maps entries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2024-06-14',
        entries: [{ timestamp: '2024-06-14T12:00:00Z', price_cents_per_kwh: 4.567 }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const entries = await fetchSpotPrices('2024-06-14')

    expect(entries).toEqual([{ timestamp: '2024-06-14T12:00:00Z', priceCentsPerKwh: 4.567 }])

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(calledUrl.pathname).toBe('/pricing/spot')
    expect(calledUrl.searchParams.get('date')).toBe('2024-06-14')
  })

  it('throws the backend error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ detail: 'Elering returned 400: Invalid date range' }),
      }),
    )

    await expect(fetchSpotPrices('2024-06-14')).rejects.toThrow('Invalid date range')
  })
})
