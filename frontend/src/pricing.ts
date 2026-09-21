const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface SpotPriceEntry {
  timestamp: string
  priceCentsPerKwh: number
}

export type PricingChoice = { type: 'fixed'; priceCentsPerKwh: number } | { type: 'spot' }

interface SpotPriceApiResponse {
  date: string
  entries: { timestamp: string; price_cents_per_kwh: number }[]
}

export async function fetchSpotPrices(date: string): Promise<SpotPriceEntry[]> {
  const url = new URL(`${API_BASE_URL}/pricing/spot`)
  url.searchParams.set('date', date)

  const response = await fetch(url.toString())

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Spot price lookup failed with status ${response.status}`)
  }

  const body: SpotPriceApiResponse = await response.json()
  return body.entries.map((entry) => ({
    timestamp: entry.timestamp,
    priceCentsPerKwh: entry.price_cents_per_kwh,
  }))
}
