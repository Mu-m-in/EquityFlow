import React from 'react'

const Team = () => {
    const bodyText = "mt-6 text-[1.05rem] text-gray-500 leading-[1.8] font-normal";

  return (
    <div className='max-w-6xl mx-auto border-t border-gray-200'>
        <h1 className='max-w-3xl mx-auto text-center text-[2rem] sm:text-[1.5rem] lg:text-2xl font-medium tracking-tight text-gray-700 leading-normal pt-8'>People</h1>
      <div className="grid gap-12 mt-10 py-10 md:grid-cols-2 items-start">
        <div className="space-y-6 text-center">
          <img className='w-75 h-75 object-cover rounded-full mx-auto' src="founder.jpeg" alt="photo" />
          <h4 className='text-2xl font-medium text-gray-700'>Mumin</h4>
          <h6 className='text-gray-500 text-lg'>Founder, CEO</h6>
        </div>
        <div className="space-y-6 max-w-125 px-8">
          <p className={bodyText}>
            Mumin founded EquityFlow in 2026 after spending a decade working with institutional investors and seeing the limitations of retail investing platforms. They set out to build something different—a platform designed for real people, not algorithms.
          </p>
          <p className={bodyText}>
           With a background in fintech and a passion for democratizing finance, Mumin leads EquityFlow's mission to make professional-grade tools accessible to everyone.
          </p>
          <p className={bodyText}>
            When not building products, Mumin enjoys mountain biking and exploring new markets.
          </p>
          <p className={bodyText}>Connect on <a className='text-blue-500' href=""> LinkedIn</a> / <a className='text-blue-500' href=""> Twitter</a> / <a className='text-blue-500' href="">Instagram</a> </p>
        </div>
      </div>
    </div>
  )
}

export default Team
