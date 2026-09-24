import { useState } from 'react'
import { parseDecimal, parseDecimalOrZero } from '../numberFormat'
import type { ExportPricing } from '../pricing'

type ExportType = ExportPricing['type']

interface FieldState {
  enabled: boolean
  type: ExportType
  fixedPrice: string
  commission: string
}

interface ExportPricingFieldsProps {
  onChange: (exportPricing: ExportPricing | null) => void
}

function buildExportPricing(state: FieldState): ExportPricing | null {
  if (!state.enabled) return null

  const commissionCentsPerKwh = parseDecimalOrZero(state.commission)

  if (state.type === 'spot') {
    return { type: 'spot', commissionCentsPerKwh }
  }

  const priceCentsPerKwh = parseDecimal(state.fixedPrice)
  if (priceCentsPerKwh === null) return null
  return { type: 'fixed', priceCentsPerKwh, commissionCentsPerKwh }
}

function ExportPricingFields({ onChange }: ExportPricingFieldsProps) {
  const [enabled, setEnabled] = useState(false)
  const [type, setType] = useState<ExportType>('spot')
  const [fixedPrice, setFixedPrice] = useState('')
  const [commission, setCommission] = useState('')

  function notify(overrides: Partial<FieldState> = {}) {
    const state: FieldState = { enabled, type, fixedPrice, commission, ...overrides }
    onChange(buildExportPricing(state))
  }

  function handleEnabledChange(next: boolean) {
    setEnabled(next)
    notify({ enabled: next })
  }

  function handleTypeChange(next: ExportType) {
    setType(next)
    notify({ type: next })
  }

  return (
    <section>
      <h2>Selling excess electricity</h2>
      <p>
        Some retailers pay you for solar you export back to the grid, sometimes minus a sales
        commission. Leave this off if your contract doesn't price exports.
      </p>

      <label className="export-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleEnabledChange(event.target.checked)}
        />
        I get paid for excess electricity fed back to the grid
      </label>

      {enabled && (
        <>
          <div className="pricing-mode" role="radiogroup" aria-label="Export pricing type">
            <label>
              <input
                type="radio"
                name="export-type"
                checked={type === 'spot'}
                onChange={() => handleTypeChange('spot')}
              />
              Market price (pörssisähkö)
            </label>
            <label>
              <input
                type="radio"
                name="export-type"
                checked={type === 'fixed'}
                onChange={() => handleTypeChange('fixed')}
              />
              Fixed price
            </label>
          </div>

          {type === 'fixed' && (
            <label className="fixed-price-field" htmlFor="export-fixed-price">
              Sell price (c/kWh)
              <input
                id="export-fixed-price"
                type="text"
                inputMode="decimal"
                placeholder="esim. 5"
                value={fixedPrice}
                onChange={(event) => {
                  setFixedPrice(event.target.value)
                  notify({ fixedPrice: event.target.value })
                }}
              />
            </label>
          )}

          <label className="fixed-price-field" htmlFor="export-commission">
            Sales commission (c/kWh)
            <input
              id="export-commission"
              type="text"
              inputMode="decimal"
              placeholder="esim. 1"
              value={commission}
              onChange={(event) => {
                setCommission(event.target.value)
                notify({ commission: event.target.value })
              }}
            />
          </label>
        </>
      )}
    </section>
  )
}

export default ExportPricingFields
