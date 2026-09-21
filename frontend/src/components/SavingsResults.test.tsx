import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { calculateSavings } from '../savings'
import SavingsResults from './SavingsResults'

vi.mock('../savings', () => ({
  calculateSavings: vi.fn(),
}))

const calculateSavingsMock = vi.mocked(calculateSavings)

const FILE = new File(['irrelevant'], 'consumption.csv', { type: 'text/csv' })
const LOCATION = { lat: 60.17, lon: 24.94 }
const PRODUCTION = { annualKwh: 1732.47, monthly: [{ month: 1, kwh: 31.62 }] }
const PRICING = { type: 'fixed' as const, priceCentsPerKwh: 10, monthlyFeeEur: 5 }

const READY_PROPS = {
  file: FILE,
  location: LOCATION,
  productionEstimate: PRODUCTION,
  pricing: PRICING,
  transferPricing: null,
}

describe('SavingsResults', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists every missing prerequisite when nothing is set yet', () => {
    render(
      <SavingsResults
        file={null}
        location={null}
        productionEstimate={null}
        pricing={null}
        transferPricing={null}
      />,
    )

    const text = screen.getByText(/still need/i).textContent ?? ''
    expect(text).toMatch(/consumption csv/i)
    expect(text).toMatch(/location/i)
    expect(text).toMatch(/solar production estimate/i)
    expect(text).toMatch(/electricity contract/i)
    expect(screen.queryByRole('button', { name: /calculate savings/i })).not.toBeInTheDocument()
  })

  it('lists only what is still missing when some prerequisites are set', () => {
    render(
      <SavingsResults
        file={FILE}
        location={LOCATION}
        productionEstimate={null}
        pricing={null}
        transferPricing={null}
      />,
    )

    const text = screen.getByText(/still need/i).textContent ?? ''
    expect(text).toMatch(/solar production estimate/i)
    expect(text).toMatch(/electricity contract/i)
    expect(text).not.toMatch(/consumption csv/i)
  })

  it('calculates and renders the results once every prerequisite is met', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 1000,
      totalSelfConsumedKwh: 150,
      totalExportedKwh: 20,
      selfConsumptionRate: 0.88,
      baselineCostEur: 150,
      withSolarCostEur: 120,
      savingsEur: 30,
      monthly: [
        {
          year: 2025,
          month: 1,
          consumptionKwh: 500,
          selfConsumedKwh: 75,
          exportedKwh: 10,
          baselineCostEur: 75,
          withSolarCostEur: 60,
          savingsEur: 15,
        },
      ],
    })
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(await screen.findByText(/€30/)).toBeInTheDocument()
    expect(screen.getByText(/88\.0%/)).toBeInTheDocument()
    expect(screen.getByText('Exported (not priced)')).toBeInTheDocument()
    expect(screen.getByText(/simplified estimate/i)).toBeInTheDocument()

    expect(calculateSavingsMock).toHaveBeenCalledWith(FILE, LOCATION, PRODUCTION, PRICING, null)
  })

  it('shows the backend error message when the calculation fails', async () => {
    calculateSavingsMock.mockRejectedValue(new Error('Unexpected CSV header'))
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(await screen.findByText(/Unexpected CSV header/)).toBeInTheDocument()
  })
})
