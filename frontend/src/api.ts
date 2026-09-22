const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface ConsumptionSummary {
  reading_count: number
  start: string
  end: string
  total_kwh: number
  average_daily_kwh: number
  flagged_reading_count: number
}

export async function uploadConsumptionCsv(file: File): Promise<ConsumptionSummary> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${API_BASE_URL}/consumption/upload`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Upload failed with status ${response.status}`)
  }

  return response.json()
}
