import { bearingToPoint, COMPASS_DIRECTIONS } from '../compass'

interface CompassPickerProps {
  bearingDegrees: number
  onChange: (bearingDegrees: number) => void
}

const SIZE = 180
const CENTER = SIZE / 2
const ARROW_RADIUS = 60
const BUTTON_RADIUS = 78

function CompassPicker({ bearingDegrees, onChange }: CompassPickerProps) {
  const arrowTip = bearingToPoint(bearingDegrees, CENTER, CENTER, ARROW_RADIUS)

  return (
    <div className="compass" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <circle cx={CENTER} cy={CENTER} r={ARROW_RADIUS} className="compass-ring" />
        <line x1={CENTER} y1={CENTER} x2={arrowTip.x} y2={arrowTip.y} className="compass-arrow" />
        <circle cx={arrowTip.x} cy={arrowTip.y} r={6} className="compass-arrow-head" />
        <circle cx={CENTER} cy={CENTER} r={3} className="compass-center" />
      </svg>

      {COMPASS_DIRECTIONS.map(({ bearing, label, short }) => {
        const point = bearingToPoint(bearing, CENTER, CENTER, BUTTON_RADIUS)
        const selected = bearing === bearingDegrees
        return (
          <button
            key={label}
            type="button"
            className={selected ? 'compass-point selected' : 'compass-point'}
            style={{ left: point.x, top: point.y }}
            aria-pressed={selected}
            aria-label={label}
            onClick={() => onChange(bearing)}
          >
            {short}
          </button>
        )
      })}
    </div>
  )
}

export default CompassPicker
