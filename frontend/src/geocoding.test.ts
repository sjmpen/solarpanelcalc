import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAddress } from './geocoding'

describe('searchAddress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('queries Nominatim and maps results to GeocodeResult', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '60.1699', lon: '24.9384', display_name: 'Helsinki, Finland' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchAddress('Helsinki')

    expect(results).toEqual([
      { lat: 60.1699, lon: 24.9384, displayName: 'Helsinki, Finland' },
    ])

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(calledUrl.origin + calledUrl.pathname).toBe(
      'https://nominatim.openstreetmap.org/search',
    )
    expect(calledUrl.searchParams.get('q')).toBe('Helsinki')
    expect(calledUrl.searchParams.get('format')).toBe('json')
  })

  it('throws when Nominatim responds with a non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    await expect(searchAddress('Helsinki')).rejects.toThrow('503')
  })
})
