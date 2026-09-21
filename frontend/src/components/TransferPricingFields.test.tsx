import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TransferPricingFields from './TransferPricingFields'

describe('TransferPricingFields', () => {
  it('starts collapsed', () => {
    render(<TransferPricingFields onChange={vi.fn()} />)

    const details = screen.getByText(/add transfer pricing/i).closest('details')
    expect(details).not.toHaveAttribute('open')
  })

  it('stays null until the flat price is filled in, then reports it', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.click(screen.getByText(/add transfer pricing/i))

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'flat' }))

    await user.type(screen.getByLabelText(/^price \(c\/kwh\)/i), '3.5')

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'flat',
      priceCentsPerKwh: 3.5,
      monthlyFeeEur: 0,
    })
  })

  it('requires both day and night prices before reporting a day-night contract', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.click(screen.getByText(/add transfer pricing/i))
    await user.click(screen.getByRole('radio', { name: /day \/ night/i }))

    await user.type(screen.getByLabelText(/day price/i), '2')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'day-night' }))

    await user.type(screen.getByLabelText(/night price/i), '1')
    expect(onChange).toHaveBeenLastCalledWith({
      type: 'day-night',
      dayPriceCentsPerKwh: 2,
      nightPriceCentsPerKwh: 1,
      monthlyFeeEur: 0,
    })
  })

  it('requires all three seasonal prices before reporting a seasonal contract', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<TransferPricingFields onChange={onChange} />)
    await user.click(screen.getByText(/add transfer pricing/i))
    await user.click(screen.getByRole('radio', { name: /seasonal/i }))

    await user.type(screen.getByLabelText(/winter day price/i), '4')
    await user.type(screen.getByLabelText(/winter night price/i), '2')
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'seasonal' }))

    await user.type(screen.getByLabelText(/rest of year price/i), '1.5')
    await user.type(screen.getByLabelText(/monthly fee/i), '4.9')

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'seasonal',
      winterDayPriceCentsPerKwh: 4,
      winterNightPriceCentsPerKwh: 2,
      otherPriceCentsPerKwh: 1.5,
      monthlyFeeEur: 4.9,
    })
  })
})
