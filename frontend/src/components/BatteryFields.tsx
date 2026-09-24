import { useState } from 'react'
import { parseDecimal } from '../numberFormat'
import type { Battery } from '../pricing'

interface FieldState {
  enabled: boolean
  capacity: string
  price: string
}

interface BatteryFieldsProps {
  onChange: (battery: Battery | null) => void
}

function buildBattery(state: FieldState): Battery | null {
  if (!state.enabled) return null

  const capacityKwh = parseDecimal(state.capacity)
  if (capacityKwh === null) return null

  return { capacityKwh, priceEur: parseDecimal(state.price) }
}

function BatteryFields({ onChange }: BatteryFieldsProps) {
  const [enabled, setEnabled] = useState(false)
  const [capacity, setCapacity] = useState('')
  const [price, setPrice] = useState('')

  function notify(overrides: Partial<FieldState> = {}) {
    const state: FieldState = { enabled, capacity, price, ...overrides }
    onChange(buildBattery(state))
  }

  function handleEnabledChange(next: boolean) {
    setEnabled(next)
    notify({ enabled: next })
  }

  return (
    <section>
      <h2>Home battery</h2>
      <p>
        Models a battery that charges from any solar surplus and discharges to cover consumption
        that would otherwise come from the grid — it never charges from the grid or exports
        stored energy. Leave this off if you're not considering a battery.
      </p>

      <label className="export-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => handleEnabledChange(event.target.checked)}
        />
        Include a home battery
      </label>

      {enabled && (
        <>
          <label className="fixed-price-field" htmlFor="battery-capacity">
            Capacity (kWh)
            <input
              id="battery-capacity"
              type="text"
              inputMode="decimal"
              placeholder="esim. 10"
              value={capacity}
              onChange={(event) => {
                setCapacity(event.target.value)
                notify({ capacity: event.target.value })
              }}
            />
          </label>

          <label className="fixed-price-field" htmlFor="battery-price">
            Cost (€, optional)
            <input
              id="battery-price"
              type="text"
              inputMode="decimal"
              placeholder="esim. 5000"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value)
                notify({ price: event.target.value })
              }}
            />
          </label>
        </>
      )}
    </section>
  )
}

export default BatteryFields
