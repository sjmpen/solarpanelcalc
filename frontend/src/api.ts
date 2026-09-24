const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface ConsumptionSummary {
  reading_count: number
  start: string
  end: string
  total_kwh: number
  average_daily_kwh: number
  flagged_reading_count: number
}

export interface DateRange {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
}

export async function uploadConsumptionCsv(file: File, dateRange?: DateRange | null): Promise<ConsumptionSummary> {
  const body = new FormData()
  body.append('file', file)

  const query = new URLSearchParams()
  if (dateRange) {
    query.set('start_date', dateRange.start)
    query.set('end_date', dateRange.end)
  }
  const queryString = query.toString()

  const response = await fetch(`${API_BASE_URL}/consumption/upload${queryString ? `?${queryString}` : ''}`, {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail ?? `Upload failed with status ${response.status}`)
  }

  return response.json()
}
