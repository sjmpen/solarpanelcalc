import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ExportPricingFields from './ExportPricingFields'

describe('ExportPricingFields', () => {
  it('reports null while disabled, and does not show any pricing fields', () => {
    render(<ExportPricingFields onChange={vi.fn()} />)

    expect(
      screen.queryByRole('radiogroup', { name: /export pricing type/i }),
    ).not.toBeInTheDocument()
  })

  it('reports a spot export immediately once enabled, with default 0 commission', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ExportPricingFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/i get paid for excess electricity/i))

    expect(onChange).toHaveBeenLastCalledWith({ type: 'spot', commissionCentsPerKwh: 0 })
  })

  it('reports the typed commission for a spot export', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ExportPricingFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/i get paid for excess electricity/i))
    await user.type(screen.getByLabelText(/sales commission/i), '0.5')

    expect(onChange).toHaveBeenLastCalledWith({ type: 'spot', commissionCentsPerKwh: 0.5 })
  })

  it('accepts a comma as the decimal separator (Finnish convention)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ExportPricingFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/i get paid for excess electricity/i))
    await user.click(screen.getByRole('radio', { name: /fixed price/i }))
    await user.type(screen.getByLabelText(/sell price/i), '4,5')
    await user.type(screen.getByLabelText(/sales commission/i), '0,5')

    expect(onChange).toHaveBeenLastCalledWith({
      type: 'fixed',
      priceCentsPerKwh: 4.5,
      commissionCentsPerKwh: 0.5,
    })
  })

  it('stays null for a fixed export until the sell price is filled in', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ExportPricingFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/i get paid for excess electricity/i))
    await user.click(screen.getByRole('radio', { name: /fixed price/i }))

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'fixed' }))

    await user.type(screen.getByLabelText(/sell price/i), '4')
    expect(onChange).toHaveBeenLastCalledWith({ type: 'fixed', priceCentsPerKwh: 4, commissionCentsPerKwh: 0 })

    await user.type(screen.getByLabelText(/sales commission/i), '1')
    expect(onChange).toHaveBeenLastCalledWith({ type: 'fixed', priceCentsPerKwh: 4, commissionCentsPerKwh: 1 })
  })

  it('reports null again when disabled after being configured', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<ExportPricingFields onChange={onChange} />)
    const toggle = screen.getByLabelText(/i get paid for excess electricity/i)
    await user.click(toggle)
    await user.click(toggle)

    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
