import React from 'react'

const PriceComponent = ({imageUrl, priceHead, descp }) => {
  return (
    <div className='px-4 text-center '>
      <img className="w-52 sm:w-40 md:w-50 mx-auto" src={imageUrl} alt="" />
      <h1 className='text-2xl font-medium tracking-tight leading-tight text-gray-700 sm:text-3xl mt-6'>{priceHead}</h1>
      <p className="mt-5 text-base sm:text-lg leading-8 text-gray-600 max-w-sm mx-auto">{descp}</p>
    </div>
  )
}

export default PriceComponent
