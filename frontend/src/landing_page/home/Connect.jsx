import { Link } from 'react-router-dom'



const Connect = () => (

  <section className="w-full bg-[#f5f9ff] py-6 mt-10 mb-14">

    <div className="mx-auto flex max-w-6xl flex-col px-6 md:flex-row items-center">

      <div className="w-full md:w-[20%] flex justify-center md:justify-start">

        <img src="logo-landing.svg" alt="Platform logo" className="w-56" />

      </div>



      <div className="w-full md:w-[65%] mt-4 pl-4 md:mt-0">

        <p className="text-gray-600 text-base leading-7 pl-5">

          Need advanced tools? Build powerful trading applications with API Connect.

          Simple HTTP APIs to place orders, stream market data, manage your account, and more.

          <Link to="/product" className="text-blue-600 ml-1 whitespace-nowrap">

            Explore →

          </Link>

        </p>

      </div>



      <div className="hidden min-[800px]:flex w-[20%] pl-2 justify-center">

        <img src="kc-banner-image.svg" alt="API Connect banner" />

      </div>

    </div>

  </section>

);



export default Connect;
