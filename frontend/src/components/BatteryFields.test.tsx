import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import BatteryFields from './BatteryFields'

describe('BatteryFields', () => {
  it('reports null while disabled, and does not show any fields', () => {
    render(<BatteryFields onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/capacity/i)).not.toBeInTheDocument()
  })

  it('stays null until capacity is filled in, then reports it with priceEur null', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<BatteryFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/include a home battery/i))

    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ capacityKwh: expect.anything() }))

    await user.type(screen.getByLabelText(/capacity/i), '10')
    expect(onChange).toHaveBeenLastCalledWith({ capacityKwh: 10, priceEur: null })
  })

  it('reports both capacity and price once both are filled in', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<BatteryFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/include a home battery/i))
    await user.type(screen.getByLabelText(/capacity/i), '10')
    await user.type(screen.getByLabelText(/cost/i), '5000')

    expect(onChange).toHaveBeenLastCalledWith({ capacityKwh: 10, priceEur: 5000 })
  })

  it('accepts a comma as the decimal separator (Finnish convention)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<BatteryFields onChange={onChange} />)
    await user.click(screen.getByLabelText(/include a home battery/i))
    await user.type(screen.getByLabelText(/capacity/i), '10,5')
    await user.type(screen.getByLabelText(/cost/i), '5000,5')

    expect(onChange).toHaveBeenLastCalledWith({ capacityKwh: 10.5, priceEur: 5000.5 })
  })

  it('reports null again when disabled after being configured', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<BatteryFields onChange={onChange} />)
    const toggle = screen.getByLabelText(/include a home battery/i)
    await user.click(toggle)
    await user.type(screen.getByLabelText(/capacity/i), '10')
    await user.click(toggle)

    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
