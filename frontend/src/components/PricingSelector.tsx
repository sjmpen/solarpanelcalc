import { useState } from 'react'
import { fetchSpotPrices, type PricingChoice, type SpotPriceEntry } from '../pricing'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatHour(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface PricingSelectorProps {
  onPricingChange: (choice: PricingChoice) => void
}

function PricingSelector({ onPricingChange }: PricingSelectorProps) {
  const [mode, setMode] = useState<'fixed' | 'spot'>('fixed')
  const [fixedPrice, setFixedPrice] = useState('')

  const [date, setDate] = useState(today())
  const [prices, setPrices] = useState<SpotPriceEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function selectFixed() {
    setMode('fixed')
    const price = Number(fixedPrice)
    if (fixedPrice && !Number.isNaN(price)) {
      onPricingChange({ type: 'fixed', priceCentsPerKwh: price })
    }
  }

  function selectSpot() {
    setMode('spot')
    onPricingChange({ type: 'spot' })
  }

  function handleFixedPriceChange(value: string) {
    setFixedPrice(value)
    const price = Number(value)
    if (value && !Number.isNaN(price)) {
      onPricingChange({ type: 'fixed', priceCentsPerKwh: price })
    }
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
          Price (c/kWh)
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
        <>
          <p>Preview a day's hourly spot prices.</p>
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
                  <th>c/kWh</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((entry) => (
                  <tr key={entry.timestamp}>
                    <td>{formatHour(entry.timestamp)}</td>
                    <td>{entry.priceCentsPerKwh.toFixed(2)}</td>
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
