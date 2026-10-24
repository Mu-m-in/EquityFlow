import React from 'react'

import PriceComponent from './PriceComponent'



const Hero = () => {

  return (

    <div className='max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 py-12'>

      <div className="max-w-3xl mx-auto text-center">

          <h1 className="text-3xl font-medium tracking-tight text-gray-700 sm:text-4xl lg:text-3xl">

            Charges

          </h1>



          <p className="mt-4 text-lg text-gray-500 sm:text-xl">

            List of all charges and taxes

          </p>

          </div>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mt-14'>

            <PriceComponent imageUrl="pricing0.svg" priceHead="Free equity delivery" descp="All equity delivery investments (NSE, BSE), are absolutely free — ₹ 0 brokerage."/>

            <PriceComponent imageUrl="pricingtrades.svg" priceHead="Intraday and F&O trades" descp="Flat ₹ 20 or 0.03% (whichever is lower) per executed order on intraday trades across equity, currency, and commodity trades. Flat ₹20 on all option trades."/>

            <PriceComponent imageUrl="pricing0.svg" priceHead="Free direct MF" descp="All direct mutual fund investments are absolutely free — ₹ 0 commissions & DP charges."/>



          </div>

    </div>

  )

}



export default Hero
