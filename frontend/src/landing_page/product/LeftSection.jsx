import React from "react";

const LeftSection = ({
  imageUrl,
  productName,
  productDescription,
  tryDemo,
  learnMore,
  gplay,
  appStore,
}) => {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid md:grid-cols-2 gap-20 items-center py-20 ">
        <div>
          <img src={imageUrl} alt="" className="w-full max-w-[90%] mx-auto" />
        </div>
        <div className="max-w-md">
          <h1 className="text-[2.2rem] px-3 font-medium leading-tight text-gray-800 ">
            {productName}
          </h1>
          <p
            className="mt-6 px-3 text-lg text-gray-600 leading-8
          "
          >
            {productDescription}
          </p>
          <div className="mt-5 px-3 flex items-center gap-8">
            {tryDemo && (
              <a className="text-blue-500 font-medium hover:text-blue-600" href={tryDemo}>
                Try demo
              </a>
            )}
            {learnMore && (
            <a
              className="text-blue-500 font-medium hover:text-blue-60 ml-10"
              href={learnMore}
            >
              Learn more
            </a> )}
          </div>
          <div className=" mt-8 flex items-center gap-4 px-3">
            <a href={gplay}>
              {" "}
              <img
                className="h-10 w-auto"
                src="google-playbadge.svg"
                alt=""
              />{" "}
            </a>
            <a href={appStore}>
              {" "}
              <img
                className="h-10 w-auto"
                src="appstore-badge.svg"
                alt=""
              />{" "}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftSection;
