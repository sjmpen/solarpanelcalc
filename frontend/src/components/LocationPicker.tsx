import { useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './leafletIconFix'
import { searchAddress, type GeocodeResult } from '../geocoding'

export interface Location {
  lat: number
  lon: number
  label?: string
}

interface LocationPickerProps {
  location: Location | null
  onLocationChange: (location: Location) => void
}

const FINLAND_CENTER: [number, number] = [64.9, 26.0]
const DEFAULT_ZOOM = 5
const SELECTED_ZOOM = 13

function ClickToSetLocation({ onLocationChange }: { onLocationChange: (location: Location) => void }) {
  useMapEvents({
    click(event) {
      onLocationChange({ lat: event.latlng.lat, lon: event.latlng.lng })
    },
  })
  return null
}

function LocationPicker({ location, onLocationChange }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) return

    setSearching(true)
    setError(null)
    setResults([])

    try {
      setResults(await searchAddress(query))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Address search failed')
    } finally {
      setSearching(false)
    }
  }

  function selectResult(result: GeocodeResult) {
    onLocationChange({ lat: result.lat, lon: result.lon, label: result.displayName })
    setResults([])
  }

  const center: [number, number] = location ? [location.lat, location.lon] : FINLAND_CENTER
  const zoom = location ? SELECTED_ZOOM : DEFAULT_ZOOM

  return (
    <section>
      <h2>House location</h2>
      <p>Search for your address, or click directly on the map.</p>

      <form className="search-form" onSubmit={handleSearch}>
        <label htmlFor="address-search">
          Address
          <input
            id="address-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. Mannerheimintie 1, Helsinki"
          />
        </label>
        <button type="submit" disabled={!query.trim() || searching}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((result) => (
            <li key={`${result.lat},${result.lon}`}>
              <button type="button" onClick={() => selectResult(result)}>
                {result.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="map-container">
        <MapContainer center={center} zoom={zoom} style={{ height: 320, width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {location && <Marker position={[location.lat, location.lon]} />}
          <ClickToSetLocation onLocationChange={onLocationChange} />
        </MapContainer>
      </div>

      {location && (
        <p className="selected-location">
          📍 {location.label ?? `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`}
        </p>
      )}
    </section>
  )
}

export default LocationPicker
