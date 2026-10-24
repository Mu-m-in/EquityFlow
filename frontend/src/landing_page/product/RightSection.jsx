import React from 'react'



const RightSection = ({imageUrl,

  productName,

  productDescription,

  learnMore,}) => {

  return (

    <div className="max-w-5xl mx-auto">

      <div className="grid md:grid-cols-2 gap-10 items-center py-20 ">

        <div className='max-w-md pl-5'>

          <h1 className="text-[2.2rem] font-medium leading-tight text-gray-800 ">

            {productName}

          </h1>

          <p

            className="mt-6 text-lg text-gray-600 leading-8

          "

          >

            {productDescription}

          </p>

          <div className="mt-5 flex">

            {learnMore && (

            <a

              className="text-blue-500 font-medium hover:text-blue-60"

              href={learnMore}

            >

              Learn more

            </a> )}

          </div>

        </div>

        <div>

            <img src={imageUrl} alt="" className="w-full max-w-[90%] mx-auto" />



        </div>

      </div>

    </div>

  )

}



export default RightSection
