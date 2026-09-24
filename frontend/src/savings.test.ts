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
        total_export_revenue_eur: 4,
        total_battery_delivered_kwh: 12.5,
        annual_benefit_eur: 340,
        payback_years: 5.9,
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
            export_revenue_eur: 4,
            battery_delivered_kwh: 12.5,
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
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
    )

    expect(result).toEqual({
      totalConsumptionKwh: 1000,
      totalSelfConsumedKwh: 150,
      totalExportedKwh: 20,
      selfConsumptionRate: 0.88,
      baselineCostEur: 150,
      withSolarCostEur: 120,
      savingsEur: 30,
      totalExportRevenueEur: 4,
      totalBatteryDeliveredKwh: 12.5,
      annualBenefitEur: 340,
      paybackYears: 5.9,
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
          exportRevenueEur: 4,
          batteryDeliveredKwh: 12.5,
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
      energy_pricing: { type: 'fixed', price_cents_per_kwh: 10 },
      transfer_pricing: { type: 'flat', price_cents_per_kwh: 3.5 },
    })
  })

  it('maps spot pricing and day-night transfer pricing to their API shapes', async () => {
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
        total_export_revenue_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'spot', marginCentsPerKwh: 0.5 },
      { type: 'day-night', dayPriceCentsPerKwh: 4, nightPriceCentsPerKwh: 2 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.energy_pricing).toEqual({ type: 'spot', margin_cents_per_kwh: 0.5 })
    expect(request.transfer_pricing).toEqual({
      type: 'day-night',
      day_price_cents_per_kwh: 4,
      night_price_cents_per_kwh: 2,
    })
  })

  it('includes start_date/end_date in the request when a date range is given', async () => {
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
        total_export_revenue_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
      { start: '2025-01-01', end: '2025-01-15' },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.start_date).toBe('2025-01-01')
    expect(request.end_date).toBe('2025-01-15')
  })

  it('omits start_date/end_date when no date range is given', async () => {
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
        total_export_revenue_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request).not.toHaveProperty('start_date')
    expect(request).not.toHaveProperty('end_date')
  })

  it('includes export_pricing in the request when given, mapped to its API shape', async () => {
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
        total_export_revenue_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
      null,
      { type: 'fixed', priceCentsPerKwh: 4, commissionCentsPerKwh: 1 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.export_pricing).toEqual({
      type: 'fixed',
      price_cents_per_kwh: 4,
      commission_cents_per_kwh: 1,
    })
  })

  it('omits export_pricing when none is given', async () => {
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
        total_export_revenue_eur: 0,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request).not.toHaveProperty('export_pricing')
  })

  it('includes system_cost_eur in the request when given', async () => {
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
        total_export_revenue_eur: 0,
        annual_benefit_eur: 0,
        payback_years: null,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
      null,
      null,
      2000,
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.system_cost_eur).toBe(2000)
  })

  it('omits system_cost_eur when none is given', async () => {
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
        total_export_revenue_eur: 0,
        annual_benefit_eur: 0,
        payback_years: null,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request).not.toHaveProperty('system_cost_eur')
  })

  it('includes battery in the request when given, mapped to its API shape', async () => {
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
        total_export_revenue_eur: 0,
        total_battery_delivered_kwh: 0,
        annual_benefit_eur: 0,
        payback_years: null,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
      null,
      null,
      null,
      { capacityKwh: 10, priceEur: 5000 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request.battery).toEqual({ capacity_kwh: 10, price_eur: 5000 })
  })

  it('omits battery when none is given', async () => {
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
        total_export_revenue_eur: 0,
        total_battery_delivered_kwh: 0,
        annual_benefit_eur: 0,
        payback_years: null,
        monthly: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await calculateSavings(
      csvFile(),
      { lat: 60.17, lon: 24.94 },
      PRODUCTION_ESTIMATE,
      { type: 'fixed', priceCentsPerKwh: 10 },
      { type: 'flat', priceCentsPerKwh: 3.5 },
    )

    const [, options] = fetchMock.mock.calls[0]
    const formData = options.body as FormData
    const request = JSON.parse(formData.get('request') as string)
    expect(request).not.toHaveProperty('battery')
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
        { type: 'spot', marginCentsPerKwh: 0 },
        { type: 'flat', priceCentsPerKwh: 0 },
      ),
    ).rejects.toThrow('Invalid date range')
  })
})
