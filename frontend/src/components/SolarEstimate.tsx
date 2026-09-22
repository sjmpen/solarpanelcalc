import { useState } from 'react'
import { compassBearingToPvgisAzimuth, directionLabel } from '../compass'
import { estimateSolarProduction, type SolarProductionEstimate } from '../solar'
import CompassPicker from './CompassPicker'
import type { Location } from './LocationPicker'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface SolarEstimateProps {
  location: Location | null
  onEstimateChange?: (estimate: SolarProductionEstimate | null) => void
}

function SolarEstimate({ location, onEstimateChange }: SolarEstimateProps) {
  const [peakPowerKw, setPeakPowerKw] = useState('')
  const [tiltDegrees, setTiltDegrees] = useState('40')
  const [compassBearing, setCompassBearing] = useState(180) // South
  const [lossPercent, setLossPercent] = useState('14')
  const [mounting, setMounting] = useState<'free' | 'building'>('free')

  const [estimate, setEstimate] = useState<SolarProductionEstimate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!location) return

    setLoading(true)
    setError(null)
    setEstimate(null)
    onEstimateChange?.(null)

    try {
      const result = await estimateSolarProduction(location, {
        peakPowerKw: Number(peakPowerKw),
        tiltDegrees: Number(tiltDegrees),
        azimuthDegrees: compassBearingToPvgisAzimuth(compassBearing),
        lossPercent: Number(lossPercent),
        mounting,
      })
      setEstimate(result)
      onEstimateChange?.(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Solar estimate failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Solar system</h2>

      {!location ? (
        <p>Pick a location above first.</p>
      ) : (
        <>
          <p>Enter your (planned) system's parameters to estimate its production.</p>

          <form className="solar-form" onSubmit={handleSubmit}>
            <label htmlFor="peak-power">
              Peak power (kWp)
              <input
                id="peak-power"
                type="number"
                min="0.1"
                step="0.1"
                value={peakPowerKw}
                onChange={(event) => setPeakPowerKw(event.target.value)}
                required
              />
            </label>

            <label htmlFor="tilt">
              Tilt (°)
              <input
                id="tilt"
                type="number"
                min="0"
                max="90"
                value={tiltDegrees}
                onChange={(event) => setTiltDegrees(event.target.value)}
              />
            </label>

            <div className="compass-field">
              <span>Panel direction</span>
              <CompassPicker bearingDegrees={compassBearing} onChange={setCompassBearing} />
              <span className="compass-label">Facing {directionLabel(compassBearing)}</span>
            </div>

            <label htmlFor="loss">
              System loss (%)
              <input
                id="loss"
                type="number"
                min="0"
                max="100"
                value={lossPercent}
                onChange={(event) => setLossPercent(event.target.value)}
              />
            </label>

            <label htmlFor="mounting">
              Mounting
              <select
                id="mounting"
                value={mounting}
                onChange={(event) => setMounting(event.target.value as 'free' | 'building')}
              >
                <option value="free">Free-standing / rack-mounted</option>
                <option value="building">Building-integrated</option>
              </select>
            </label>

            <button type="submit" disabled={!peakPowerKw || loading}>
              {loading ? 'Estimating…' : 'Estimate production'}
            </button>
          </form>

          {error && <div className="error">{error}</div>}

          {estimate && (
            <div className="summary">
              <p>
                Estimated annual production: <strong>{estimate.annualKwh.toLocaleString()} kWh/year</strong>
              </p>
              <table className="monthly-production">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.monthly.map((row) => (
                    <tr key={row.month}>
                      <td>{MONTH_NAMES[row.month - 1]}</td>
                      <td>{row.kwh.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default SolarEstimate
