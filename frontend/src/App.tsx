import { useState } from 'react'
import './App.css'
import ConsumptionUpload from './components/ConsumptionUpload'
import LocationPicker, { type Location } from './components/LocationPicker'
import SolarEstimate from './components/SolarEstimate'

function App() {
  const [location, setLocation] = useState<Location | null>(null)

  return (
    <>
      <h1>solarpanelcalc</h1>

      <ConsumptionUpload />
      <LocationPicker location={location} onLocationChange={setLocation} />
      <SolarEstimate location={location} />
    </>
  )
}

export default App
