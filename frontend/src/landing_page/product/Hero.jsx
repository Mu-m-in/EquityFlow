import React from 'react'

const Hero = () => {
  return (
    <div className='max-w-6xl mx-auto border-b border-gray-200 pb-10'>
      <div className="max-w-3xl mx-auto mt-10 pt-10 pb-10 text-center">
          <h1 className="max-w-3xl text-[1.65rem] font-medium tracking-tight text-gray-700 sm:text-4xl">
            EquityFlow Products
          </h1>

          <p className="mt-6 text-lg text-gray-600 max-w-xl mx-auto
          ">
            Sleek, modern, and intuitive trading platforms
          </p>
          <p className="mt-6 text-lg text-gray-600 max-w-xl mx-auto
          ">Check out our <a className='text-blue-500 font-medium hover:text-blue-600' href="">investment offerings →</a></p>
          </div>
    </div>
  )
}

export default Hero
