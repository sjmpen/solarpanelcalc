import { useState } from 'react'
import { fetchSpotPrices, type PricingChoice, type SpotPriceEntry } from '../pricing'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatHour(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toNumberOrZero(value: string): number {
  if (!value) return 0
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

interface PricingSelectorProps {
  onPricingChange: (choice: PricingChoice) => void
}

interface FieldState {
  mode: 'fixed' | 'spot'
  fixedPrice: string
  margin: string
}

function PricingSelector({ onPricingChange }: PricingSelectorProps) {
  const [mode, setMode] = useState<'fixed' | 'spot'>('fixed')
  const [fixedPrice, setFixedPrice] = useState('')
  const [margin, setMargin] = useState('')

  const [date, setDate] = useState(today())
  const [prices, setPrices] = useState<SpotPriceEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function notifyPricingChange(overrides: Partial<FieldState> = {}) {
    const state: FieldState = { mode, fixedPrice, margin, ...overrides }

    if (state.mode === 'fixed') {
      const price = Number(state.fixedPrice)
      if (state.fixedPrice && !Number.isNaN(price)) {
        onPricingChange({ type: 'fixed', priceCentsPerKwh: price })
      }
    } else {
      onPricingChange({
        type: 'spot',
        marginCentsPerKwh: toNumberOrZero(state.margin),
      })
    }
  }

  function selectFixed() {
    setMode('fixed')
    notifyPricingChange({ mode: 'fixed' })
  }

  function selectSpot() {
    setMode('spot')
    notifyPricingChange({ mode: 'spot' })
  }

  function handleFixedPriceChange(value: string) {
    setFixedPrice(value)
    notifyPricingChange({ fixedPrice: value })
  }

  function handleMarginChange(value: string) {
    setMargin(value)
    notifyPricingChange({ margin: value })
  }

  async function handleLoadPrices(event: React.FormEvent) {
    event.preventDefault()

    setLoading(true)
    setError(null)
    setPrices(null)

    try {
      setPrices(await fetchSpotPrices(date))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spot price lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const marginValue = toNumberOrZero(margin)

  return (
    <section>
      <h2>Electricity contract</h2>

      <div className="pricing-mode" role="radiogroup" aria-label="Electricity contract type">
        <label>
          <input type="radio" name="pricing-mode" checked={mode === 'fixed'} onChange={selectFixed} />
          Fixed price
        </label>
        <label>
          <input type="radio" name="pricing-mode" checked={mode === 'spot'} onChange={selectSpot} />
          Spot price (pörssisähkö)
        </label>
      </div>

      {mode === 'fixed' && (
        <label className="fixed-price-field" htmlFor="fixed-price">
          Price (c/kWh, incl. VAT)
          <input
            id="fixed-price"
            type="number"
            min="0"
            step="0.01"
            value={fixedPrice}
            onChange={(event) => handleFixedPriceChange(event.target.value)}
          />
        </label>
      )}

      {mode === 'spot' && (
        <label className="fixed-price-field" htmlFor="spot-margin">
          Margin (c/kWh)
          <input
            id="spot-margin"
            type="number"
            min="0"
            step="0.01"
            value={margin}
            onChange={(event) => handleMarginChange(event.target.value)}
          />
        </label>
      )}

      {mode === 'spot' && (
        <>
          <p>
            Preview a day's hourly spot prices. Prices include 25.5% VAT.
          </p>
          <form className="spot-form" onSubmit={handleLoadPrices}>
            <label htmlFor="spot-date">
              Date
              <input
                id="spot-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Load prices'}
            </button>
          </form>

          {error && <div className="error">{error}</div>}

          {prices && (
            <table className="spot-prices">
              <thead>
                <tr>
                  <th>Hour</th>
                  <th>Spot (c/kWh)</th>
                  <th>Total (c/kWh)</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((entry) => (
                  <tr key={entry.timestamp}>
                    <td>{formatHour(entry.timestamp)}</td>
                    <td>{entry.priceCentsPerKwh.toFixed(2)}</td>
                    <td>{(entry.priceCentsPerKwh + marginValue).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  )
}

export default PricingSelector
