import { useState } from 'react'
import './App.css'
import { uploadConsumptionCsv, type ConsumptionSummary } from './api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<ConsumptionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)
    setSummary(null)

    try {
      setSummary(await uploadConsumptionCsv(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h1>solarpanelcalc</h1>
      <p>Upload your Fingrid Datahub consumption CSV to get started.</p>

      <form className="upload-form" onSubmit={handleSubmit}>
        <label htmlFor="consumption-csv">
          Consumption CSV
          <input
            id="consumption-csv"
            type="file"
            accept=".csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
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
    </>
  )
}

export default App
