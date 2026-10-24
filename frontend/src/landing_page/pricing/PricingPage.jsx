import React from 'react'
import Hero from './Hero'
import OpenAccount from '../../OpenAccount'
import ChargesTable from './ChargesTable'
import { accountOpeningData, dematData } from "./PricingData";

const PricingPage = () => (
  <>
  <Hero/>
  <ChargesTable
  title="Charges for account opening"
  headers={["Type of account", "Charges"]}
  rows={accountOpeningData}
/>
<ChargesTable
  title="Demat AMC (Annual Maintenance Charge)"
  headers={["Value of holdings", "AMC"]}
  rows={dematData}
/>

  <OpenAccount/>
  </>
)

export default PricingPage
