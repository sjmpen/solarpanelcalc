import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TransferPricingFields from './TransferPricingFields'

describe('TransferPricingFields', () => {
  it('renders immediately, defaulted to the flat rate type', () => {
    render(<TransferPricingFields onChange={vi.fn()} />)

    expect(screen.getByRole('radio', { name: /flat rate/i })).toBeChecked()
    expect(screen.getByLabelText(/^price \(c\/kwh\)/i)).toBeInTheDocument()
  })

  it('stays null until the flat price is filled in, then reports it', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'flat' }))

    await user.type(screen.getByLabelText(/^price \(c\/kwh\)/i), '3.5')

    expect(onChange).toHaveBeenLastCalledWith({ type: 'flat', priceCentsPerKwh: 3.5 })
  })

  it('accepts a comma as the decimal separator (Finnish convention)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.type(screen.getByLabelText(/^price \(c\/kwh\)/i), '3,5')

    expect(onChange).toHaveBeenLastCalledWith({ type: 'flat', priceCentsPerKwh: 3.5 })
  })

  it('requires both day and night prices before reporting a day-night contract', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: /day \/ night/i }))

    await user.type(screen.getByLabelText(/day price/i), '2')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'day-night' }))

    await user.type(screen.getByLabelText(/night price/i), '1')
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'day-night',
      dayPriceCentsPerKwh: 2,
      nightPriceCentsPerKwh: 1,
    })
  })

  it('requires all three seasonal prices before reporting a seasonal contract', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: /seasonal/i }))

    await user.type(screen.getByLabelText(/winter day price/i), '4')
    await user.type(screen.getByLabelText(/winter night price/i), '2')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'seasonal' }))

    await user.type(screen.getByLabelText(/rest of year price/i), '1.5')

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'seasonal',
      winterDayPriceCentsPerKwh: 4,
      winterNightPriceCentsPerKwh: 2,
      otherPriceCentsPerKwh: 1.5,
    })
  })
})
