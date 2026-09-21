import { useState } from 'react'
import './App.css'
import ConsumptionUpload from './components/ConsumptionUpload'
import LocationPicker, { type Location } from './components/LocationPicker'

function App() {
  const [location, setLocation] = useState<Location | null>(null)

  return (
    <>
      <h1>solarpanelcalc</h1>

      <ConsumptionUpload />
      <LocationPicker location={location} onLocationChange={setLocation} />
    </>
  )
}

export default App
