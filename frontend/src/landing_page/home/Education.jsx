import { Link } from 'react-router-dom'

const Education = () => (
  <section className="mx-auto max-w-6xl px-4 py-4 flex flex-col min-[800px]:flex-row gap-8 items-center my-16">
    <div className="w-full min-[800px]:w-[55%] flex justify-center">
      <Link to="/product">
        <img
          src="index-education.svg"
          alt="Education illustration"
          className="w-full max-w-md mx-auto"
        />
      </Link>
    </div>
    <div className="w-full min-[800px]:w-[45%] p-5 flex flex-col items-start">
      <h3 className="text-[1.65rem] font-medium text-[#424242] mb-5">
        Free education and community support
      </h3>
      <p className="text-base leading-8 text-[#666] mt-3 mb-8 w-full">
        LearningVault brings you comprehensive market education covering everything from the basics to advanced investment strategies, all completely free.
      </p>
      <Link className="text-blue-600 whitespace-nowrap" to="/product">
        LearningVault →
      </Link>
      <p className="text-base leading-8 text-[#666] my-8 w-full">
        Community Forum is where thousands of investors connect, share insights, and get answers to their trading and investment questions.
      </p>
      <Link className="text-blue-600 whitespace-nowrap" to="/support">
        Community Forum →
      </Link>
    </div>
  </section>
);

export default Education;
