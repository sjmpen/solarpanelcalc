export interface CompassDirection {
  bearing: number
  label: string
  short: string
}

// Compass bearing: 0 = North, clockwise (N, NE, E, SE, S, SW, W, NW).
export const COMPASS_DIRECTIONS: CompassDirection[] = [
  { bearing: 0, label: 'North', short: 'N' },
  { bearing: 45, label: 'Northeast', short: 'NE' },
  { bearing: 90, label: 'East', short: 'E' },
  { bearing: 135, label: 'Southeast', short: 'SE' },
  { bearing: 180, label: 'South', short: 'S' },
  { bearing: 225, label: 'Southwest', short: 'SW' },
  { bearing: 270, label: 'West', short: 'W' },
  { bearing: 315, label: 'Northwest', short: 'NW' },
]

export function directionLabel(bearingDegrees: number): string {
  return COMPASS_DIRECTIONS.find((d) => d.bearing === bearingDegrees)?.label ?? `${bearingDegrees}°`
}

/** A point on a circle for a compass bearing (0 = North/up, clockwise), in SVG/screen coordinates. */
export function bearingToPoint(bearingDegrees: number, cx: number, cy: number, radius: number) {
  const radians = (bearingDegrees * Math.PI) / 180
  return {
    x: cx + radius * Math.sin(radians),
    y: cy - radius * Math.cos(radians),
  }
}

/**
 * Converts a compass bearing (0 = North, clockwise) to PVGIS's azimuth
 * convention (0 = South, positive towards West, negative towards East,
 * range (-180, 180]).
 */
export function compassBearingToPvgisAzimuth(bearingDegrees: number): number {
  let azimuth = bearingDegrees - 180
  if (azimuth <= -180) azimuth += 360
  if (azimuth > 180) azimuth -= 360
  return azimuth
}
