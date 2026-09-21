const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export interface GeocodeResult {
  lat: number
  lon: number
  displayName: string
}

interface NominatimSearchResult {
  lat: string
  lon: string
  display_name: string
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '5')

  const response = await fetch(url.toString())

  if (!response.ok) {
    throw new Error(`Address search failed with status ${response.status}`)
  }

  const results: NominatimSearchResult[] = await response.json()

  return results.map((result) => ({
    lat: Number(result.lat),
    lon: Number(result.lon),
    displayName: result.display_name,
  }))
}
