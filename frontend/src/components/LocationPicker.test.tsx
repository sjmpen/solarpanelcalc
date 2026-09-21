import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchAddress } from '../geocoding'
import LocationPicker from './LocationPicker'

vi.mock('../geocoding', () => ({
  searchAddress: vi.fn(),
}))

// react-leaflet's MapContainer needs real layout/canvas that jsdom doesn't
// provide. We mock the library and test our own glue code instead: that
// useMapEvents' click handler is wired to onLocationChange, and that a
// Marker gets the right position — not Leaflet's own rendering.
let capturedClickHandler: ((event: { latlng: { lat: number; lng: number } }) => void) | undefined

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div
      data-testid="map"
      onClick={() => capturedClickHandler?.({ latlng: { lat: 61.1, lng: 25.2 } })}
    >
      {children}
    </div>
  ),
  TileLayer: () => null,
  Marker: ({ position }: { position: [number, number] }) => (
    <div data-testid="marker">{position.join(',')}</div>
  ),
  useMapEvents: (handlers: { click?: (event: { latlng: { lat: number; lng: number } }) => void }) => {
    capturedClickHandler = handlers.click
    return null
  },
}))

vi.mock('./leafletIconFix', () => ({}))

const searchAddressMock = vi.mocked(searchAddress)

describe('LocationPicker', () => {
  afterEach(() => {
    vi.clearAllMocks()
    capturedClickHandler = undefined
  })

  it('searches and lets the user pick a result', async () => {
    searchAddressMock.mockResolvedValue([
      { lat: 60.1699, lon: 24.9384, displayName: 'Helsinki, Finland' },
    ])
    const onLocationChange = vi.fn()
    const user = userEvent.setup()

    render(<LocationPicker location={null} onLocationChange={onLocationChange} />)

    await user.type(screen.getByLabelText(/address/i), 'Helsinki')
    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(await screen.findByText('Helsinki, Finland')).toBeInTheDocument()

    await user.click(screen.getByText('Helsinki, Finland'))

    expect(onLocationChange).toHaveBeenCalledWith({
      lat: 60.1699,
      lon: 24.9384,
      label: 'Helsinki, Finland',
    })
  })

  it('sets a location when the map is clicked', async () => {
    const onLocationChange = vi.fn()
    const user = userEvent.setup()

    render(<LocationPicker location={null} onLocationChange={onLocationChange} />)

    await user.click(screen.getByTestId('map'))

    expect(onLocationChange).toHaveBeenCalledWith({ lat: 61.1, lon: 25.2 })
  })

  it('shows a marker and label when a location is already selected', () => {
    render(
      <LocationPicker
        location={{ lat: 60.1699, lon: 24.9384, label: 'Helsinki, Finland' }}
        onLocationChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('marker')).toHaveTextContent('60.1699,24.9384')
    expect(screen.getByText(/Helsinki, Finland/)).toBeInTheDocument()
  })

  it('shows the search error message when the search fails', async () => {
    searchAddressMock.mockRejectedValue(new Error('Address search failed with status 503'))
    const user = userEvent.setup()

    render(<LocationPicker location={null} onLocationChange={vi.fn()} />)

    await user.type(screen.getByLabelText(/address/i), 'Nowhere')
    await user.click(screen.getByRole('button', { name: /search/i }))

    expect(await screen.findByText('Address search failed with status 503')).toBeInTheDocument()
  })
})
