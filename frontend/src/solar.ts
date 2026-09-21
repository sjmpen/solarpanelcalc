const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface SolarSystemParams {
  peakPowerKw: number
  tiltDegrees: number
  azimuthDegrees: number
  lossPercent?: number
  mounting?: 'free' | 'building'
}

export interface MonthlyProduction {
  month: number
  kwh: number
}

export interface SolarProductionEstimate {
  annualKwh: number
  monthly: MonthlyProduction[]
}

interface SolarEstimateApiResponse {
  annual_kwh: number
  monthly: { month: number; kwh: number }[]
}

export async function estimateSolarProduction(
  location: { lat: number; lon: number },
  params: SolarSystemParams,
): Promise<SolarProductionEstimate> {
  const response = await fetch(`${API_BASE_URL}/solar/estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: location.lat,
      lon: location.lon,
      peak_power_kw: params.peakPowerKw,
      tilt_degrees: params.tiltDegrees,
      azimuth_degrees: params.azimuthDegrees,
      loss_percent: params.lossPercent,
      mounting: params.mounting,
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Solar estimate failed with status ${response.status}`)
  }

  const body: SolarEstimateApiResponse = await response.json()
  return {
    annualKwh: body.annual_kwh,
    monthly: body.monthly,
  }
}
