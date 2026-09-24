import { useState } from 'react'
import type { DateRange } from '../api'
import { parseDecimal } from '../numberFormat'
import type { ExportPricing, PricingChoice, TransferPricing } from '../pricing'
import { calculateSavings, type MonthlySavings, type SavingsResult } from '../savings'
import type { SolarProductionEstimate } from '../solar'
import type { Location } from './LocationPicker'

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface SavingsResultsProps {
  file: File | null
  dateRange?: DateRange | null
  location: Location | null
  productionEstimate: SolarProductionEstimate | null
  pricing: PricingChoice | null
  transferPricing: TransferPricing | null
  exportPricing?: ExportPricing | null
}

function missingPrerequisites(props: SavingsResultsProps): string[] {
  const missing: string[] = []
  if (!props.file) missing.push('a consumption CSV')
  if (!props.location) missing.push('a location')
  if (!props.productionEstimate) missing.push('a solar production estimate')
  if (!props.pricing) missing.push('an electricity contract')
  if (!props.transferPricing) missing.push('transfer pricing')
  return missing
}

function niceMax(value: number): number {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

const BAR_WIDTH = 20
const BAR_GAP = 12
const PLOT_HEIGHT = 180
const MARGIN = { top: 16, right: 16, bottom: 28, left: 48 }

function MonthlySavingsChart({ monthly }: { monthly: MonthlySavings[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const maxPositive = niceMax(Math.max(0, ...monthly.map((m) => m.savingsEur)))
  const maxNegative = niceMax(Math.max(0, ...monthly.map((m) => -m.savingsEur)))
  const hasNegative = monthly.some((m) => m.savingsEur < 0)
  const range = hasNegative ? maxPositive + maxNegative : maxPositive
  const baselineY = MARGIN.top + PLOT_HEIGHT * (hasNegative ? maxPositive / range : 1)
  const scale = PLOT_HEIGHT / range

  const plotWidth = monthly.length * (BAR_WIDTH + BAR_GAP)
  const width = MARGIN.left + plotWidth + MARGIN.right
  const height = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom

  const yTicks = hasNegative ? [-maxNegative, 0, maxPositive] : [0, maxPositive / 2, maxPositive]

  return (
    <div className="chart-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Monthly savings, euros"
      >
        {yTicks.map((tick) => {
          const y = baselineY - tick * scale
          return (
            <g key={tick}>
              <line x1={MARGIN.left} y1={y} x2={width - MARGIN.right} y2={y} className="chart-gridline" />
              <text x={MARGIN.left - 8} y={y} className="chart-axis-label" textAnchor="end" dy="0.32em">
                {tick.toLocaleString()}
              </text>
            </g>
          )
        })}

        {monthly.map((m, index) => {
          const x = MARGIN.left + index * (BAR_WIDTH + BAR_GAP)
          const barY = m.savingsEur >= 0 ? baselineY - m.savingsEur * scale : baselineY
          const barHeight = Math.abs(m.savingsEur) * scale
          const isHovered = hovered === index

          return (
            <g key={`${m.year}-${m.month}`}>
              <rect
                x={x}
                y={barY}
                width={BAR_WIDTH}
                height={Math.max(barHeight, 0)}
                rx={4}
                className={isHovered ? 'chart-bar chart-bar-hovered' : 'chart-bar'}
                onPointerEnter={() => setHovered(index)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                tabIndex={0}
                aria-label={`${MONTH_ABBR[m.month - 1]} ${m.year}: €${m.savingsEur.toFixed(2)} saved`}
              />
              <text
                x={x + BAR_WIDTH / 2}
                y={height - MARGIN.bottom + 16}
                className="chart-axis-label"
                textAnchor="middle"
              >
                {MONTH_ABBR[m.month - 1]}
              </text>
            </g>
          )
        })}
      </svg>

      {hovered !== null && (
        <div className="chart-tooltip" role="status">
          <strong>€{monthly[hovered].savingsEur.toFixed(2)}</strong> saved in{' '}
          {MONTH_ABBR[monthly[hovered].month - 1]} {monthly[hovered].year}
        </div>
      )}
    </div>
  )
}

function SavingsResults({
  file,
  dateRange,
  location,
  productionEstimate,
  pricing,
  transferPricing,
  exportPricing,
}: SavingsResultsProps) {
  const [result, setResult] = useState<SavingsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [systemCost, setSystemCost] = useState('')
  const [lastSystemCostEur, setLastSystemCostEur] = useState<number | null>(null)

  const missing = missingPrerequisites({ file, location, productionEstimate, pricing, transferPricing })
  const ready = missing.length === 0

  async function handleCalculate() {
    if (!file || !location || !productionEstimate || !pricing || !transferPricing) return

    setLoading(true)
    setError(null)
    setResult(null)

    const systemCostEur = parseDecimal(systemCost)
    setLastSystemCostEur(systemCostEur)

    try {
      setResult(
        await calculateSavings(
          file,
          location,
          productionEstimate,
          pricing,
          transferPricing,
          dateRange,
          exportPricing,
          systemCostEur,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Savings calculation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section>
      <h2>Results</h2>

      {!ready ? (
        <p>Still need: {missing.join(', ')}.</p>
      ) : (
        <>
          <label className="fixed-price-field" htmlFor="system-cost">
            System cost (€, optional)
            <input
              id="system-cost"
              type="text"
              inputMode="decimal"
              placeholder="esim. 8000"
              value={systemCost}
              onChange={(event) => setSystemCost(event.target.value)}
            />
          </label>

          <button type="button" className="calculate-button" onClick={handleCalculate} disabled={loading}>
            {loading ? 'Calculating…' : 'Calculate savings'}
          </button>

          {error && <div className="error">{error}</div>}

          {result && (
            <div className="savings-result">
              <p className="savings-headline">
                You would have {result.totalExportRevenueEur > 0 ? 'gained' : 'saved'}{' '}
                <strong>€{(result.savingsEur + result.totalExportRevenueEur).toLocaleString()}</strong> over{' '}
                {result.monthly.length} month{result.monthly.length === 1 ? '' : 's'}
                {result.totalExportRevenueEur > 0 ? ' in savings and export income' : ''}.
              </p>

              {lastSystemCostEur !== null && (
                <p className="payback-line">
                  {result.paybackYears !== null ? (
                    <>
                      Estimated payback period: <strong>{result.paybackYears.toLocaleString()} years</strong>
                    </>
                  ) : (
                    'Based on this estimate, the system would not pay for itself.'
                  )}
                </p>
              )}

              <div className="summary">
                <dl>
                  <dt>Baseline cost (no solar)</dt>
                  <dd>€{result.baselineCostEur.toLocaleString()}</dd>

                  <dt>Cost with solar</dt>
                  <dd>€{result.withSolarCostEur.toLocaleString()}</dd>

                  <dt>Self-consumption savings</dt>
                  <dd>€{result.savingsEur.toLocaleString()}</dd>

                  <dt>Self-consumption rate</dt>
                  <dd>{(result.selfConsumptionRate * 100).toFixed(1)}%</dd>

                  <dt>Exported</dt>
                  <dd>{result.totalExportedKwh.toLocaleString()} kWh</dd>

                  <dt>Export revenue</dt>
                  <dd>€{result.totalExportRevenueEur.toLocaleString()}</dd>

                  <dt>Annualized benefit</dt>
                  <dd>€{result.annualBenefitEur.toLocaleString()}/year</dd>
                </dl>
              </div>

              {result.monthly.length > 0 && <MonthlySavingsChart monthly={result.monthly} />}

              <table className="monthly-production">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Self-consumed</th>
                    <th>Exported</th>
                    <th>Savings</th>
                    <th>Export revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {result.monthly.map((m) => (
                    <tr key={`${m.year}-${m.month}`}>
                      <td>
                        {MONTH_ABBR[m.month - 1]} {m.year}
                      </td>
                      <td>{m.selfConsumedKwh.toLocaleString()} kWh</td>
                      <td>{m.exportedKwh.toLocaleString()} kWh</td>
                      <td>€{m.savingsEur.toLocaleString()}</td>
                      <td>€{m.exportRevenueEur.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="hint">
                This is a simplified estimate, not a bill-accurate simulation. Solar production is
                synthesized hourly from monthly PVGIS totals using a sunrise/sunset daylight model, not
                real hourly irradiance data. Exported (excess) energy is only priced as export revenue
                when sell-back pricing is entered above; otherwise it's shown in kWh but excluded from
                the totals, since sell-back compensation varies by contract. Hours with no matching spot
                price (if using spot pricing) are excluded rather than estimated. The annualized benefit
                (and any payback period) scales the calculated period up to a full year and assumes
                today's prices and production hold steady — most accurate with close to a year of real
                consumption data.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default SavingsResults
