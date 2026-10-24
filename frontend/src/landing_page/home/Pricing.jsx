const pricingHighlights = [

  {

    src: "pricing0.svg",

    alt: "Instant account setup",

    label: "Instant account setup",

  },

  {

    src: "pricing-eq.svg",

    alt: "Investments with zero commissions",

    label: "Investments with zero commissions",

  },

  {

    src: "pricingtrades.svg",

    alt: "Trading with flat rates",

    label: "Trading with flat rates",

  },

];



import { Link } from 'react-router-dom'



const Pricing = () => (

  <section className="mx-auto max-w-6xl px-4 py-10 flex flex-col min-[800px]:flex-row justify-between gap-8 text-justify">

    <div className="w-full lg:w-[40%] flex flex-col gap-8">

      <div>

        <h3 className="text-[1.65rem] font-medium text-[#424242] mb-3">

          Transparent pricing, zero surprises

        </h3>

        <p className="text-base leading-8 text-[#666]">

          We believe in simple, honest pricing. No hidden fees, no surprise charges.

          Just straightforward pricing so you can invest with confidence.

        </p>

        <Link to="/pricing" className="text-[#387ed1] font-medium mt-4 inline-block">

          See pricing →

        </Link>

      </div>

    </div>



    <div className="w-full lg:w-[55%] mt-10 min-[800px]:mt-0 px-3">

      <div className="grid grid-cols-1 min-[800px]:grid-cols-3 justify-items-center min-[800px]:justify-items-stretch gap-8">

        {pricingHighlights.map((item) => (

          <div key={item.src} className="flex items-center gap-2">

            <img src={item.src} alt={item.alt} className="w-21.25" />

            <p className="text-[12px] text-[#666] leading-5">{item.label}</p>

          </div>

        ))}

      </div>

    </div>

  </section>

);



export default Pricing;
