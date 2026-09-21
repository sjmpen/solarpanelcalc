import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CompassPicker from './CompassPicker'

describe('CompassPicker', () => {
  it('renders all 8 compass directions and marks the current one selected', () => {
    render(<CompassPicker bearingDegrees={180} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'North' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'South' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'North' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the clicked direction\'s bearing', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(<CompassPicker bearingDegrees={180} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Northeast' }))

    expect(onChange).toHaveBeenCalledWith(45)
  })
})
