import React from "react";
import Hero from "./Hero";
import LeftSection from "./LeftSection";
import RightSection from "./RightSection";

const ProductPage = () => (
  <>
    <Hero />
    <LeftSection
      imageUrl="products-kite.png"
      productName="TradeHub"
      productDescription="Our ultra-fast flagship trading platform with streaming market data, advanced charts, an elegant UI, and more. Enjoy the TradeHub experience seamlessly on your Android and iOS devices."
      tryDemo="#"
      learnMore="#"
      gplay="#"
      appStore="#"
    />

    <RightSection
      imageUrl="products-console.png"
      productName="PortfolioHub"
      productDescription="The central dashboard for your EquityFlow account. Gain insights into your trades and investments with in-depth reports and visualisations."
      learnMore="#"
    />

    <LeftSection
      imageUrl="products-coin.png"
      productName="InvestHub"
      productDescription="Buy direct mutual funds online, commission-free, delivered directly to your Demat account. Enjoy the investment experience on your Android and iOS devices."
      tryDemo="#"
      learnMore="#"
      gplay="#"
      appStore="#"
    />

    <RightSection
      imageUrl="landing.svg"
      productName="API Connect"
      productDescription="Build powerful trading platforms and experiences with our simple HTTP/JSON APIs. Whether you're a startup or an established firm, create your investment app and grow with our ecosystem."
      learnMore="#"
    />

    <LeftSection
      imageUrl="varsity-products.svg"
      productName="LearningVault Mobile"
      productDescription="A comprehensive collection of market lessons with in-depth coverage and illustrations. Content is broken down into bite-size cards to help you learn on the go."
      gplay="#"
      appStore="#"
    />

    <p
      className='text-center m-10  className="mt-6 text-lg text-gray-600 max-w-xl mx-auto
          "'
    >
      Want to know more about our technology stack? Check out the{" "}
      <a className="text-blue-500 font-medium hover:text-blue-600" href="#">
        EquityFlow.tech
      </a>{" "}
      blog.
    </p>
  </>
);

export default ProductPage;
