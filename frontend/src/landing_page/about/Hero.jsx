import React from "react";

const Hero = () => {
  const bodyText = "mt-6 text-[1.05rem] text-gray-500 leading-[1.8] font-normal";

  return (
    <div className="max-w-6xl mx-auto px-4 py-16">
      <div className=" py-10 border-b border-gray-200">
        <h1 className="max-w-3xl mx-auto text-center text-[2rem] sm:text-[1.5rem] lg:text-2xl font-medium tracking-tight text-gray-700 leading-normal">
          We're making professional investing accessible to everyone.
          <br />
          No gatekeeping. No compromises.
        </h1>
      </div>

      <div className="grid gap-12 mt-10 py-10 md:grid-cols-2">
        <div className="space-y-6 px-6">
          <p className={bodyText}>
            EquityFlow was founded with a simple mission: to democratize access to professional-grade investing tools. We believe that retail investors deserve the same resources as institutions, without paying premium fees.
          </p>
          <p className={bodyText}>
            We're building a modern fintech platform that combines cutting-edge technology with transparent pricing. Our goal is to remove the barriers between you and your financial goals.
          </p>
          <p className={bodyText}>
            Today, thousands of investors trust EquityFlow to power their investment journey. We handle millions of transactions annually, and we're just getting started.
          </p>
        </div>
        <div className="space-y-6 px-6">
          <p className={bodyText}>
            Beyond just a platform, we're building an entire ecosystem. We invest in innovative fintech solutions that serve our community.
          </p>
          <p className={bodyText}>
            Our community and education initiatives are free because we believe informed investors make better decisions. Knowledge should never be gatekept.
          </p>
          <p className={bodyText}>
            Everything we build is guided by a single principle: our customers first. No gimmicks, no dark patterns, just honest tools that work.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Hero;
