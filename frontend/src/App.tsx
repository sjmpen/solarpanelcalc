import { useState } from 'react'
import './App.css'
import ConsumptionUpload from './components/ConsumptionUpload'
import LocationPicker, { type Location } from './components/LocationPicker'
import PricingSelector from './components/PricingSelector'
import SavingsResults from './components/SavingsResults'
import SolarEstimate from './components/SolarEstimate'
import TransferPricingFields from './components/TransferPricingFields'
import type { PricingChoice, TransferPricing } from './pricing'
import type { SolarProductionEstimate } from './solar'

function App() {
  const [consumptionFile, setConsumptionFile] = useState<File | null>(null)
  const [location, setLocation] = useState<Location | null>(null)
  const [productionEstimate, setProductionEstimate] = useState<SolarProductionEstimate | null>(null)
  const [pricing, setPricing] = useState<PricingChoice | null>(null)
  const [transferPricing, setTransferPricing] = useState<TransferPricing | null>(null)

  return (
    <>
      <img src="/hero-landscape.svg" alt="" className="hero-banner" />
      <h1>solarpanelcalc</h1>

      <ConsumptionUpload onFileSelected={setConsumptionFile} />
      <LocationPicker location={location} onLocationChange={setLocation} />
      <SolarEstimate location={location} onEstimateChange={setProductionEstimate} />
      <PricingSelector onPricingChange={setPricing} />
      <TransferPricingFields onChange={setTransferPricing} />
      <SavingsResults
        file={consumptionFile}
        location={location}
        productionEstimate={productionEstimate}
        pricing={pricing}
        transferPricing={transferPricing}
      />
    </>
  )
}

export default App
