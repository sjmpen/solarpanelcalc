import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadConsumptionCsv } from '../api'
import ConsumptionUpload from './ConsumptionUpload'

vi.mock('../api', () => ({
  uploadConsumptionCsv: vi.fn(),
}))

const uploadConsumptionCsvMock = vi.mocked(uploadConsumptionCsv)

function csvFile() {
  return new File(['irrelevant,for,this,test'], 'consumption.csv', { type: 'text/csv' })
}

describe('ConsumptionUpload', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reports the selected file via onFileSelected as soon as it is picked', async () => {
    const onFileSelected = vi.fn()
    const user = userEvent.setup()
    const file = csvFile()

    render(<ConsumptionUpload onFileSelected={onFileSelected} />)

    await user.upload(screen.getByLabelText(/consumption csv/i), file)

    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('still uploads and shows a summary without onFileSelected being passed', async () => {
    uploadConsumptionCsvMock.mockResolvedValue({
      reading_count: 192,
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-02T23:45:00Z',
      total_kwh: 136.55,
      average_daily_kwh: 68.275,
      flagged_reading_count: 1,
    })
    const user = userEvent.setup()

    render(<ConsumptionUpload />)

    await user.upload(screen.getByLabelText(/consumption csv/i), csvFile())
    await user.click(screen.getByRole('button', { name: /upload/i }))

    expect(await screen.findByText('192')).toBeInTheDocument()
  })

  it('shows date range fields defaulted to the full range after upload, and reports it via onDateRangeChange', async () => {
    uploadConsumptionCsvMock.mockResolvedValue({
      reading_count: 192,
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-02T23:45:00Z',
      total_kwh: 136.55,
      average_daily_kwh: 68.275,
      flagged_reading_count: 1,
    })
    const onDateRangeChange = vi.fn()
    const user = userEvent.setup()

    render(<ConsumptionUpload onDateRangeChange={onDateRangeChange} />)

    await user.upload(screen.getByLabelText(/consumption csv/i), csvFile())
    await user.click(screen.getByRole('button', { name: /upload/i }))
    await screen.findByText('192')

    expect(screen.getByLabelText(/from/i)).toHaveValue('2025-01-01')
    expect(screen.getByLabelText(/to/i)).toHaveValue('2025-01-02')
    expect(onDateRangeChange).toHaveBeenLastCalledWith({ start: '2025-01-01', end: '2025-01-02' })
  })

  it('re-uploads with a narrowed range and refreshes the summary when the date fields change', async () => {
    uploadConsumptionCsvMock.mockResolvedValueOnce({
      reading_count: 192,
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-02T23:45:00Z',
      total_kwh: 136.55,
      average_daily_kwh: 68.275,
      flagged_reading_count: 1,
    })
    uploadConsumptionCsvMock.mockResolvedValueOnce({
      reading_count: 88,
      start: '2025-01-01T00:00:00Z',
      end: '2025-01-01T21:45:00Z',
      total_kwh: 60.0,
      average_daily_kwh: 65.45,
      flagged_reading_count: 0,
    })
    const onDateRangeChange = vi.fn()
    const user = userEvent.setup()
    const file = csvFile()

    render(<ConsumptionUpload onDateRangeChange={onDateRangeChange} />)

    await user.upload(screen.getByLabelText(/consumption csv/i), file)
    await user.click(screen.getByRole('button', { name: /upload/i }))
    await screen.findByText('192')

    fireEvent.change(screen.getByLabelText(/to/i), { target: { value: '2025-01-01' } })

    expect(await screen.findByText('88')).toBeInTheDocument()
    expect(uploadConsumptionCsvMock).toHaveBeenLastCalledWith(file, { start: '2025-01-01', end: '2025-01-01' })
    expect(onDateRangeChange).toHaveBeenLastCalledWith({ start: '2025-01-01', end: '2025-01-01' })
  })
})
