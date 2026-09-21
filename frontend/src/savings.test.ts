import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculateSavings } from './savings'

function csvFile() {
  return new File(['irrelevant,for,this,test'], 'consumption.csv', { type: 'text/csv' })
}

const PRODUCTION_ESTIMATE = { annualKwh: 1732.47, monthly: [{ month: 1, kwh: 31.62 }] }

describe('calculateSavings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the file, location, production, pricing, and transfer pricing, and maps the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_consumption_kwh: 1000,
        total_self_consumed_kwh: 150,
        total_exported_kwh: 20,
        self_consumption_rate: 0.88,
        baseline_cost_eur: 150,
        with_solar_cost_eur: 120,
        savings_eur: 30,
        monthly: [
          {
            year: 2025,
            month: 1,
            consumption_kwh: 500,
            self_consumed_kwh: 75,
            exported_kwh: 10,
            baseline_cost_eur: 75,
            with_solar_cost_eur: 60,
            savings_eur: 15,
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = csvFile()
    const result = await calculateSavings(
      file,
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10, monthlyFeeEur: 5 },
      { type: 'flat', priceCentsPerKwh: 3.5, monthlyFeeEur: 6 },
    )

    expect(result).toEqual({
      totalConsumptionKwh: 1000,
      totalSelfConsumedKwh: 150,
      totalExportedKwh: 20,
      selfConsumptionRate: 0.88,
      baselineCostEur: 150,
      withSolarCostEur: 120,
      savingsEur: 30,
      monthly: [
        {
          year: 2025,
          month: 1,
          consumptionKwh: 500,
          selfConsumedKwh: 75,
          exportedKwh: 10,
          baselineCostEur: 75,
          withSolarCostEur: 60,
          savingsEur: 15,
        },
      ],
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/savings/calculate')
    expect(options.method).toBe('POST')

    const formData = options.body as FormData
    expect(formData.get('file')).toBe(file)
    expect(JSON.parse(formData.get('request') as string)).toEqual({
      lat: 60.17,
      lon: 24.94,
      monthly_production: [{ month: 1, kwh: 31.62 }],
      energy_pricing: { type: 'fixed', price_cents_per_kwh: 10, monthly_fee_eur: 5 },
      transfer_pricing: { type: 'flat', price_cents_per_kwh: 3.5, monthly_fee_eur: 6 },
    })
  })

  it('sends a null transfer_pricing when none is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_consumption_kwh: 0,
        total_self_consumed_kwh: 0,
        total_exported_kwh: 0,
        self_consumption_rate: 0,
        baseline_cost_eur: 0,
        with_solar_cost_eur: 0,
        savings_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'spot', marginCentsPerKwh: 0.5, monthlyFeeEur: 0 },
      null,
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.transfer_pricing).toBeNull()
    expect(request.energy_pricing).toEqual({
      type: 'spot',
      margin_cents_per_kwh: 0.5,
      monthly_fee_eur: 0,
    })
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

    await expect(
      calculateSavings(
        csvFile(),
        { lat: 60.17, lon: 24.94 },
        PRODUCTION_ESTIMATE,
        { type: 'spot', marginCentsPerKwh: 0, monthlyFeeEur: 0 },
        null,
      ),
    ).rejects.toThrow('Invalid date range')
  })
})
