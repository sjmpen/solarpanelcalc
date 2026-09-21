import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { estimateSolarProduction } from '../solar'
import SolarEstimate from './SolarEstimate'

vi.mock('../solar', () => ({
  estimateSolarProduction: vi.fn(),
}))

const estimateSolarProductionMock = vi.mocked(estimateSolarProduction)

describe('SolarEstimate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a hint instead of the form when no location is picked yet', () => {
    render(<SolarEstimate location={null} />)

    expect(screen.getByText(/pick a location above first/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/peak power/i)).not.toBeInTheDocument()
  })

  it('submits system params for the given location and renders the estimate', async () => {
    estimateSolarProductionMock.mockResolvedValue({
      annualKwh: 1732.47,
      monthly: [{ month: 1, kwh: 31.62 }],
    })
    const user = userEvent.setup()

    render(<SolarEstimate location={{ lat: 60.17, lon: 24.94 }} />)

    await user.type(screen.getByLabelText(/peak power/i), '5')
    await user.click(screen.getByRole('button', { name: /estimate production/i }))

    expect(await screen.findByText(/1,732.47 kWh\/year/)).toBeInTheDocument()
    expect(screen.getByText('January')).toBeInTheDocument()

    // default compass direction is South, which is PVGIS azimuth 0
    expect(estimateSolarProductionMock).toHaveBeenCalledWith(
      { lat: 60.17, lon: 24.94 },
      expect.objectContaining({ peakPowerKw: 5, tiltDegrees: 40, azimuthDegrees: 0 }),
    )
  })

  it('converts the picked compass direction to PVGIS azimuth', async () => {
    estimateSolarProductionMock.mockResolvedValue({ annualKwh: 1000, monthly: [] })
    const user = userEvent.setup()

    render(<SolarEstimate location={{ lat: 60.17, lon: 24.94 }} />)

    await user.type(screen.getByLabelText(/peak power/i), '5')
    await user.click(screen.getByRole('button', { name: 'West' }))
    expect(screen.getByText('Facing West')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /estimate production/i }))

    expect(estimateSolarProductionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ azimuthDegrees: 90 }),
    )
  })

  it('shows the backend error message when the estimate fails', async () => {
    estimateSolarProductionMock.mockRejectedValue(
      new Error('PVGIS returned 400: Location outside coverage'),
    )
    const user = userEvent.setup()

    render(<SolarEstimate location={{ lat: 0, lon: 0 }} />)

    await user.type(screen.getByLabelText(/peak power/i), '5')
    await user.click(screen.getByRole('button', { name: /estimate production/i }))

    expect(await screen.findByText(/Location outside coverage/)).toBeInTheDocument()
  })
})
