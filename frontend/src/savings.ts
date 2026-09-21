import type { PricingChoice, TransferPricing } from './pricing'
import type { SolarProductionEstimate } from './solar'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface MonthlySavings {
  year: number
  month: number
  consumptionKwh: number
  selfConsumedKwh: number
  exportedKwh: number
  baselineCostEur: number
  withSolarCostEur: number
  savingsEur: number
}

export interface SavingsResult {
  totalConsumptionKwh: number
  totalSelfConsumedKwh: number
  totalExportedKwh: number
  selfConsumptionRate: number
  baselineCostEur: number
  withSolarCostEur: number
  savingsEur: number
  monthly: MonthlySavings[]
}

interface SavingsApiResponse {
  total_consumption_kwh: number
  total_self_consumed_kwh: number
  total_exported_kwh: number
  self_consumption_rate: number
  baseline_cost_eur: number
  with_solar_cost_eur: number
  savings_eur: number
  monthly: {
    year: number
    month: number
    consumption_kwh: number
    self_consumed_kwh: number
    exported_kwh: number
    baseline_cost_eur: number
    with_solar_cost_eur: number
    savings_eur: number
  }[]
}

function energyPricingToApi(pricing: PricingChoice) {
  if (pricing.type === 'fixed') {
    return {
      type: 'fixed',
      price_cents_per_kwh: pricing.priceCentsPerKwh,
      monthly_fee_eur: pricing.monthlyFeeEur,
    }
  }
  return {
    type: 'spot',
    margin_cents_per_kwh: pricing.marginCentsPerKwh,
    monthly_fee_eur: pricing.monthlyFeeEur,
  }
}

function transferPricingToApi(transfer: TransferPricing | null) {
  if (!transfer) return null

  if (transfer.type === 'flat') {
    return {
      type: 'flat',
      price_cents_per_kwh: transfer.priceCentsPerKwh,
      monthly_fee_eur: transfer.monthlyFeeEur,
    }
  }
  if (transfer.type === 'day-night') {
    return {
      type: 'day-night',
      day_price_cents_per_kwh: transfer.dayPriceCentsPerKwh,
      night_price_cents_per_kwh: transfer.nightPriceCentsPerKwh,
      monthly_fee_eur: transfer.monthlyFeeEur,
    }
  }
  return {
    type: 'seasonal',
    winter_day_price_cents_per_kwh: transfer.winterDayPriceCentsPerKwh,
    winter_night_price_cents_per_kwh: transfer.winterNightPriceCentsPerKwh,
    other_price_cents_per_kwh: transfer.otherPriceCentsPerKwh,
    monthly_fee_eur: transfer.monthlyFeeEur,
  }
}

export async function calculateSavings(
  file: File,
  location: { lat: number; lon: number },
  productionEstimate: SolarProductionEstimate,
  pricing: PricingChoice,
  transferPricing: TransferPricing | null,
): Promise<SavingsResult> {
  const requestBody = {
    lat: location.lat,
    lon: location.lon,
    monthly_production: productionEstimate.monthly,
    energy_pricing: energyPricingToApi(pricing),
    transfer_pricing: transferPricingToApi(transferPricing),
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('request', JSON.stringify(requestBody))

  const response = await fetch(`${API_BASE_URL}/savings/calculate`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Savings calculation failed with status ${response.status}`)
  }

  const body: SavingsApiResponse = await response.json()
  return {
    totalConsumptionKwh: body.total_consumption_kwh,
    totalSelfConsumedKwh: body.total_self_consumed_kwh,
    totalExportedKwh: body.total_exported_kwh,
    selfConsumptionRate: body.self_consumption_rate,
    baselineCostEur: body.baseline_cost_eur,
    withSolarCostEur: body.with_solar_cost_eur,
    savingsEur: body.savings_eur,
    monthly: body.monthly.map((m) => ({
      year: m.year,
      month: m.month,
      consumptionKwh: m.consumption_kwh,
      selfConsumedKwh: m.self_consumed_kwh,
      exportedKwh: m.exported_kwh,
      baselineCostEur: m.baseline_cost_eur,
      withSolarCostEur: m.with_solar_cost_eur,
      savingsEur: m.savings_eur,
    })),
  }
}
