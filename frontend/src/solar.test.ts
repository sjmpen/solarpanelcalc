import { afterEach, describe, expect, it, vi } from 'vitest'
import { estimateSolarProduction } from './solar'

describe('estimateSolarProduction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts location + system params and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        annual_kwh: 1732.47,
        monthly: [{ month: 1, kwh: 31.62 }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const estimate = await estimateSolarProduction(
      { lat: 60.17, lon: 24.94 },
      { peakPowerKw: 5, tiltDegrees: 40, azimuthDegrees: 0 },
    )

    expect(estimate).toEqual({
      annualKwh: 1732.47,
      monthly: [{ month: 1, kwh: 31.62 }],
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/solar/estimate')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      lat: 60.17,
      lon: 24.94,
      peak_power_kw: 5,
      tilt_degrees: 40,
      azimuth_degrees: 0,
      loss_percent: undefined,
      mounting: undefined,
    })
  })

  it('throws the backend error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ detail: 'PVGIS returned 400: Location outside coverage' }),
      }),
    )

    await expect(
      estimateSolarProduction({ lat: 0, lon: 0 }, { peakPowerKw: 5, tiltDegrees: 40, azimuthDegrees: 0 }),
    ).rejects.toThrow('Location outside coverage')
  })
})
