import { useState } from 'react'
import './App.css'
import ConsumptionUpload from './components/ConsumptionUpload'
import LocationPicker, { type Location } from './components/LocationPicker'
import PricingSelector from './components/PricingSelector'
import SolarEstimate from './components/SolarEstimate'
import type { PricingChoice } from './pricing'

function App() {
  const [location, setLocation] = useState<Location | null>(null)
  const [, setPricing] = useState<PricingChoice | null>(null)

  return (
    <>
      <h1>solarpanelcalc</h1>

      <ConsumptionUpload />
      <LocationPicker location={location} onLocationChange={setLocation} />
      <SolarEstimate location={location} />
      <PricingSelector onPricingChange={setPricing} />
    </>
  )
}

export default App
