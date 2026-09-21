import { describe, expect, it } from 'vitest'
import { bearingToPoint, compassBearingToPvgisAzimuth, directionLabel } from './compass'

describe('compassBearingToPvgisAzimuth', () => {
  it.each([
    [0, 180], // North -> PVGIS north (±180)
    [90, -90], // East -> PVGIS east
    [180, 0], // South -> PVGIS south
    [270, 90], // West -> PVGIS west
    [45, -135], // Northeast
    [135, -45], // Southeast
    [225, 45], // Southwest
    [315, 135], // Northwest
  ])('maps compass bearing %i° to PVGIS azimuth %i°', (bearing, expected) => {
    expect(compassBearingToPvgisAzimuth(bearing)).toBe(expected)
  })
})

describe('directionLabel', () => {
  it('labels known compass points', () => {
    expect(directionLabel(0)).toBe('North')
    expect(directionLabel(180)).toBe('South')
  })
})

describe('bearingToPoint', () => {
  it('places North straight up from center', () => {
    const point = bearingToPoint(0, 100, 100, 50)
    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(50)
  })

  it('places East to the right of center', () => {
    const point = bearingToPoint(90, 100, 100, 50)
    expect(point.x).toBeCloseTo(150)
    expect(point.y).toBeCloseTo(100)
  })

  it('places South straight down from center', () => {
    const point = bearingToPoint(180, 100, 100, 50)
    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(150)
  })
})
