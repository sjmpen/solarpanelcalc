import { useState } from 'react'
import './App.css'
import ConsumptionUpload from './components/ConsumptionUpload'
import LocationPicker, { type Location } from './components/LocationPicker'
import PricingSelector from './components/PricingSelector'
import SolarEstimate from './components/SolarEstimate'
import TransferPricingFields from './components/TransferPricingFields'
import type { PricingChoice, TransferPricing } from './pricing'

function App() {
  const [location, setLocation] = useState<Location | null>(null)
  const [, setPricing] = useState<PricingChoice | null>(null)
  const [, setTransferPricing] = useState<TransferPricing | null>(null)

  return (
    <>
      <h1>solarpanelcalc</h1>

      <ConsumptionUpload />
      <LocationPicker location={location} onLocationChange={setLocation} />
      <SolarEstimate location={location} />
      <PricingSelector onPricingChange={setPricing} />
      <TransferPricingFields onChange={setTransferPricing} />
    </>
  )
}

export default App
