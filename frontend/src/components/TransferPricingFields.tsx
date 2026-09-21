import { useState } from 'react'
import type { TransferPricing } from '../pricing'

type TransferType = TransferPricing['type']

interface FieldState {
  type: TransferType
  flatPrice: string
  dayPrice: string
  nightPrice: string
  winterDayPrice: string
  winterNightPrice: string
  otherPrice: string
  monthlyFee: string
}

interface TransferPricingFieldsProps {
  onChange: (transfer: TransferPricing | null) => void
}

function parsePositive(value: string): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function buildTransferPricing(state: FieldState): TransferPricing | null {
  const monthlyFeeEur = parsePositive(state.monthlyFee) ?? 0

  if (state.type === 'flat') {
    const priceCentsPerKwh = parsePositive(state.flatPrice)
    if (priceCentsPerKwh === null) return null
    return { type: 'flat', priceCentsPerKwh, monthlyFeeEur }
  }

  if (state.type === 'day-night') {
    const dayPriceCentsPerKwh = parsePositive(state.dayPrice)
    const nightPriceCentsPerKwh = parsePositive(state.nightPrice)
    if (dayPriceCentsPerKwh === null || nightPriceCentsPerKwh === null) return null
    return { type: 'day-night', dayPriceCentsPerKwh, nightPriceCentsPerKwh, monthlyFeeEur }
  }

  const winterDayPriceCentsPerKwh = parsePositive(state.winterDayPrice)
  const winterNightPriceCentsPerKwh = parsePositive(state.winterNightPrice)
  const otherPriceCentsPerKwh = parsePositive(state.otherPrice)
  if (
    winterDayPriceCentsPerKwh === null ||
    winterNightPriceCentsPerKwh === null ||
    otherPriceCentsPerKwh === null
  ) {
    return null
  }
  return {
    type: 'seasonal',
    winterDayPriceCentsPerKwh,
    winterNightPriceCentsPerKwh,
    otherPriceCentsPerKwh,
    monthlyFeeEur,
  }
}

function TransferPricingFields({ onChange }: TransferPricingFieldsProps) {
  const [type, setType] = useState<TransferType>('flat')
  const [flatPrice, setFlatPrice] = useState('')
  const [dayPrice, setDayPrice] = useState('')
  const [nightPrice, setNightPrice] = useState('')
  const [winterDayPrice, setWinterDayPrice] = useState('')
  const [winterNightPrice, setWinterNightPrice] = useState('')
  const [otherPrice, setOtherPrice] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')

  function notify(overrides: Partial<FieldState> = {}) {
    const state: FieldState = {
      type,
      flatPrice,
      dayPrice,
      nightPrice,
      winterDayPrice,
      winterNightPrice,
      otherPrice,
      monthlyFee,
      ...overrides,
    }
    onChange(buildTransferPricing(state))
  }

  function handleTypeChange(next: TransferType) {
    setType(next)
    notify({ type: next })
  }

  return (
    <section>
      <h2>Electricity transfer</h2>
      <details className="transfer-pricing">
        <summary>Add transfer pricing (optional)</summary>

        <p>
          Paid separately to your local grid company (e.g. Elenia, Caruna) — not your
          electricity retailer.
        </p>

        <div className="pricing-mode" role="radiogroup" aria-label="Transfer contract type">
          <label>
            <input
              type="radio"
              name="transfer-type"
              checked={type === 'flat'}
              onChange={() => handleTypeChange('flat')}
            />
            Flat rate
          </label>
          <label>
            <input
              type="radio"
              name="transfer-type"
              checked={type === 'day-night'}
              onChange={() => handleTypeChange('day-night')}
            />
            Day / night
          </label>
          <label>
            <input
              type="radio"
              name="transfer-type"
              checked={type === 'seasonal'}
              onChange={() => handleTypeChange('seasonal')}
            />
            Seasonal
          </label>
        </div>

        {type === 'flat' && (
          <label className="fixed-price-field" htmlFor="transfer-flat-price">
            Price (c/kWh)
            <input
              id="transfer-flat-price"
              type="number"
              min="0"
              step="0.01"
              value={flatPrice}
              onChange={(event) => {
                setFlatPrice(event.target.value)
                notify({ flatPrice: event.target.value })
              }}
            />
          </label>
        )}

        {type === 'day-night' && (
          <>
            <p className="hint">Day: 07:00–22:00. Night: 22:00–07:00.</p>
            <label className="fixed-price-field" htmlFor="transfer-day-price">
              Day price (c/kWh)
              <input
                id="transfer-day-price"
                type="number"
                min="0"
                step="0.01"
                value={dayPrice}
                onChange={(event) => {
                  setDayPrice(event.target.value)
                  notify({ dayPrice: event.target.value })
                }}
              />
            </label>
            <label className="fixed-price-field" htmlFor="transfer-night-price">
              Night price (c/kWh)
              <input
                id="transfer-night-price"
                type="number"
                min="0"
                step="0.01"
                value={nightPrice}
                onChange={(event) => {
                  setNightPrice(event.target.value)
                  notify({ nightPrice: event.target.value })
                }}
              />
            </label>
          </>
        )}

        {type === 'seasonal' && (
          <>
            <p className="hint">
              Winter: Nov 1 – Mar 31. Winter day: Mon–Sat 07:00–21:00. Winter night: rest of
              winter. Rest of year: Apr 1 – Oct 31, all the time. (Common Finnish DSO
              definitions, e.g. Elenia's Kausisähkö — check your own contract for exact hours.)
            </p>
            <label className="fixed-price-field" htmlFor="transfer-winter-day-price">
              Winter day price (c/kWh)
              <input
                id="transfer-winter-day-price"
                type="number"
                min="0"
                step="0.01"
                value={winterDayPrice}
                onChange={(event) => {
                  setWinterDayPrice(event.target.value)
                  notify({ winterDayPrice: event.target.value })
                }}
              />
            </label>
            <label className="fixed-price-field" htmlFor="transfer-winter-night-price">
              Winter night price (c/kWh)
              <input
                id="transfer-winter-night-price"
                type="number"
                min="0"
                step="0.01"
                value={winterNightPrice}
                onChange={(event) => {
                  setWinterNightPrice(event.target.value)
                  notify({ winterNightPrice: event.target.value })
                }}
              />
            </label>
            <label className="fixed-price-field" htmlFor="transfer-other-price">
              Rest of year price (c/kWh)
              <input
                id="transfer-other-price"
                type="number"
                min="0"
                step="0.01"
                value={otherPrice}
                onChange={(event) => {
                  setOtherPrice(event.target.value)
                  notify({ otherPrice: event.target.value })
                }}
              />
            </label>
          </>
        )}

        <label className="fixed-price-field" htmlFor="transfer-monthly-fee">
          Monthly fee (€/month)
          <input
            id="transfer-monthly-fee"
            type="number"
            min="0"
            step="0.01"
            value={monthlyFee}
            onChange={(event) => {
              setMonthlyFee(event.target.value)
              notify({ monthlyFee: event.target.value })
            }}
          />
        </label>
      </details>
    </section>
  )
}

export default TransferPricingFields
