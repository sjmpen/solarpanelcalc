import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSpotPrices } from '../pricing'
import PricingSelector from './PricingSelector'

vi.mock('../pricing', async () => {
  const actual = await vi.importActual<typeof import('../pricing')>('../pricing')
  return { ...actual, fetchSpotPrices: vi.fn() }
})

const fetchSpotPricesMock = vi.mocked(fetchSpotPrices)

describe('PricingSelector', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to fixed price and reports the typed value', async () => {
    const onPricingChange = vi.fn()
    const user = userEvent.setup()

    render(<PricingSelector onPricingChange={onPricingChange} />)

    await user.type(screen.getByLabelText(/price \(c\/kwh/i), '8.5')

    expect(onPricingChange).toHaveBeenLastCalledWith({ type: 'fixed', priceCentsPerKwh: 8.5 })
  })

  it('switches to spot mode, loads prices, and renders the hourly table', async () => {
    fetchSpotPricesMock.mockResolvedValue([
      { timestamp: '2024-06-14T12:00:00Z', priceCentsPerKwh: 4.57 },
    ])
    const onPricingChange = vi.fn()
    const user = userEvent.setup()

    render(<PricingSelector onPricingChange={onPricingChange} />)

    await user.click(screen.getByRole('radio', { name: /spot price/i }))
    expect(onPricingChange).toHaveBeenCalledWith({ type: 'spot' })
    expect(screen.getByText(/25\.5% vat/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /load prices/i }))

    expect(await screen.findByText('4.57')).toBeInTheDocument()
    expect(fetchSpotPricesMock).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
  })

  it('shows the backend error message when the spot lookup fails', async () => {
    fetchSpotPricesMock.mockRejectedValue(new Error('Elering returned 400: Invalid date range'))
    const user = userEvent.setup()

    render(<PricingSelector onPricingChange={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /spot price/i }))
    await user.click(screen.getByRole('button', { name: /load prices/i }))

    expect(await screen.findByText(/Invalid date range/)).toBeInTheDocument()
  })
})
