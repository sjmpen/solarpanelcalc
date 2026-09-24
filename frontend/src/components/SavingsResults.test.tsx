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
const PRICING = { type: 'fixed' as const, priceCentsPerKwh: 10 }
const TRANSFER = { type: 'flat' as const, priceCentsPerKwh: 3.0 }

const READY_PROPS = {
  file: FILE,
  location: LOCATION,
  productionEstimate: PRODUCTION,
  pricing: PRICING,
  transferPricing: TRANSFER,
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
    expect(text).toMatch(/transfer pricing/i)
    expect(screen.queryByRole('button', { name: /calculate savings/i })).not.toBeInTheDocument()
  })

  it('lists only what is still missing when some prerequisites are set', () => {
    render(
      <SavingsResults
        file={FILE}
        location={LOCATION}
        productionEstimate={null}
        pricing={null}
        transferPricing={TRANSFER}
      />,
    )

    const text = screen.getByText(/still need/i).textContent ?? ''
    expect(text).toMatch(/solar production estimate/i)
    expect(text).toMatch(/electricity contract/i)
    expect(text).not.toMatch(/consumption csv/i)
    expect(text).not.toMatch(/transfer pricing/i)
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
      totalExportRevenueEur: 0,
      annualBenefitEur: 120,
      paybackYears: null,
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
          exportRevenueEur: 0,
        },
      ],
    })
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    await screen.findByText(/simplified estimate/i)
    expect(document.querySelector('.savings-headline')?.textContent).toMatch(/you would have saved €30/i)
    expect(screen.getByText(/88\.0%/)).toBeInTheDocument()
    expect(screen.getAllByText('Exported').length).toBeGreaterThan(0)
    expect(screen.getByText(/simplified estimate/i)).toBeInTheDocument()
    expect(screen.queryByText(/estimated payback period/i)).not.toBeInTheDocument()

    expect(calculateSavingsMock).toHaveBeenCalledWith(
      FILE,
      LOCATION,
      PRODUCTION,
      PRICING,
      TRANSFER,
      undefined,
      undefined,
      null,
    )
  })

  it('folds export revenue into the headline when it is present', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 1000,
      totalSelfConsumedKwh: 150,
      totalExportedKwh: 20,
      selfConsumptionRate: 0.88,
      baselineCostEur: 150,
      withSolarCostEur: 120,
      savingsEur: 30,
      totalExportRevenueEur: 5,
      annualBenefitEur: 140,
      paybackYears: null,
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
          exportRevenueEur: 5,
        },
      ],
    })
    const user = userEvent.setup()
    const exportPricing = { type: 'spot' as const, commissionCentsPerKwh: 0.5 }

    render(<SavingsResults {...READY_PROPS} exportPricing={exportPricing} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    await screen.findByText(/simplified estimate/i)
    expect(document.querySelector('.savings-headline')?.textContent).toMatch(
      /you would have gained €35 .*savings and export income/i,
    )
    expect(calculateSavingsMock).toHaveBeenCalledWith(
      FILE,
      LOCATION,
      PRODUCTION,
      PRICING,
      TRANSFER,
      undefined,
      exportPricing,
      null,
    )
  })

  it('passes the selected date range through to calculateSavings', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 0,
      totalSelfConsumedKwh: 0,
      totalExportedKwh: 0,
      selfConsumptionRate: 0,
      baselineCostEur: 0,
      withSolarCostEur: 0,
      savingsEur: 0,
      totalExportRevenueEur: 0,
      annualBenefitEur: 0,
      paybackYears: null,
      monthly: [],
    })
    const user = userEvent.setup()
    const dateRange = { start: '2025-01-01', end: '2025-01-15' }

    render(<SavingsResults {...READY_PROPS} dateRange={dateRange} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(calculateSavingsMock).toHaveBeenCalledWith(
      FILE,
      LOCATION,
      PRODUCTION,
      PRICING,
      TRANSFER,
      dateRange,
      undefined,
      null,
    )
  })

  it('shows the payback period when a system cost is entered', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 1000,
      totalSelfConsumedKwh: 150,
      totalExportedKwh: 20,
      selfConsumptionRate: 0.88,
      baselineCostEur: 150,
      withSolarCostEur: 120,
      savingsEur: 30,
      totalExportRevenueEur: 0,
      annualBenefitEur: 120,
      paybackYears: 16.7,
      monthly: [],
    })
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.type(screen.getByLabelText(/system cost/i), '2000')
    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    await screen.findByText(/estimated payback period/i)
    expect(document.querySelector('.payback-line')?.textContent).toMatch(/16\.7 years/)
    expect(screen.getAllByText(/annualized benefit/i).length).toBeGreaterThan(0)

    expect(calculateSavingsMock).toHaveBeenCalledWith(
      FILE,
      LOCATION,
      PRODUCTION,
      PRICING,
      TRANSFER,
      undefined,
      undefined,
      2000,
    )
  })

  it('accepts a comma as the decimal separator for system cost', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 0,
      totalSelfConsumedKwh: 0,
      totalExportedKwh: 0,
      selfConsumptionRate: 0,
      baselineCostEur: 0,
      withSolarCostEur: 0,
      savingsEur: 0,
      totalExportRevenueEur: 0,
      annualBenefitEur: 0,
      paybackYears: null,
      monthly: [],
    })
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.type(screen.getByLabelText(/system cost/i), '2000,5')
    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(calculateSavingsMock).toHaveBeenCalledWith(
      FILE,
      LOCATION,
      PRODUCTION,
      PRICING,
      TRANSFER,
      undefined,
      undefined,
      2000.5,
    )
  })

  it('shows "would not pay for itself" when annual benefit is zero despite a cost being entered', async () => {
    calculateSavingsMock.mockResolvedValue({
      totalConsumptionKwh: 0,
      totalSelfConsumedKwh: 0,
      totalExportedKwh: 0,
      selfConsumptionRate: 0,
      baselineCostEur: 0,
      withSolarCostEur: 0,
      savingsEur: 0,
      totalExportRevenueEur: 0,
      annualBenefitEur: 0,
      paybackYears: null,
      monthly: [],
    })
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.type(screen.getByLabelText(/system cost/i), '2000')
    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(await screen.findByText(/would not pay for itself/i)).toBeInTheDocument()
  })

  it('shows the backend error message when the calculation fails', async () => {
    calculateSavingsMock.mockRejectedValue(new Error('Unexpected CSV header'))
    const user = userEvent.setup()

    render(<SavingsResults {...READY_PROPS} />)

    await user.click(screen.getByRole('button', { name: /calculate savings/i }))

    expect(await screen.findByText(/Unexpected CSV header/)).toBeInTheDocument()
  })
})
