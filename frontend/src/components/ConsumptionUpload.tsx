import { useState } from 'react'
import { uploadConsumptionCsv, type ConsumptionSummary, type DateRange } from '../api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

// YYYY-MM-DD in UTC, to match what an <input type="date"> expects/produces.
function toDateInputValue(iso: string): string {
  return iso.slice(0, 10)
}

interface ConsumptionUploadProps {
  onFileSelected?: (file: File | null) => void
  onDateRangeChange?: (range: DateRange | null) => void
}

function ConsumptionUpload({ onFileSelected, onDateRangeChange }: ConsumptionUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<ConsumptionSummary | null>(null)
  const [fullRange, setFullRange] = useState<DateRange | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setSummary(null)
    setFullRange(null)
    setDateRange(null)
    onDateRangeChange?.(null)

    try {
      const result = await uploadConsumptionCsv(file)
      const range = { start: toDateInputValue(result.start), end: toDateInputValue(result.end) }
      setSummary(result)
      setFullRange(range)
      setDateRange(range)
      onDateRangeChange?.(range)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleDateRangeChange(next: DateRange) {
    if (!file) return

    setDateRange(next)
    setLoading(true)
    setError(null)

    try {
      setSummary(await uploadConsumptionCsv(file, next))
      onDateRangeChange?.(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Consumption history</h2>
      <p>Upload your Fingrid Datahub consumption CSV to get started.</p>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label htmlFor="consumption-csv">
          Consumption CSV
          <input
            id="consumption-csv"
            type="file"
            accept=".csv"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null
              setFile(selected)
              setSummary(null)
              setFullRange(null)
              setDateRange(null)
              onFileSelected?.(selected)
              onDateRangeChange?.(null)
            }}
          />
        </label>
        <button type="submit" disabled={!file || loading}>
          {loading ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {summary && (
        <div className="summary">
          <dl>
            <dt>Readings parsed</dt>
            <dd>{summary.reading_count.toLocaleString()}</dd>

            <dt>Period</dt>
            <dd>
              {formatDate(summary.start)} – {formatDate(summary.end)}
            </dd>

            <dt>Total consumption</dt>
            <dd>{summary.total_kwh.toLocaleString()} kWh</dd>

            <dt>Average daily use</dt>
            <dd>{summary.average_daily_kwh.toLocaleString()} kWh/day</dd>

            <dt>Flagged readings</dt>
            <dd>{summary.flagged_reading_count}</dd>
          </dl>
        </div>
      )}

      {fullRange && dateRange && (
        <div className="date-range-fields">
          <label htmlFor="consumption-start-date">
            From
            <input
              id="consumption-start-date"
              type="date"
              min={fullRange.start}
              max={dateRange.end}
              value={dateRange.start}
              disabled={loading}
              onChange={(event) => handleDateRangeChange({ ...dateRange, start: event.target.value })}
            />
          </label>
          <label htmlFor="consumption-end-date">
            To
            <input
              id="consumption-end-date"
              type="date"
              min={dateRange.start}
              max={fullRange.end}
              value={dateRange.end}
              disabled={loading}
              onChange={(event) => handleDateRangeChange({ ...dateRange, end: event.target.value })}
            />
          </label>
        </div>
      )}
    </section>
  )
}

export default ConsumptionUpload
