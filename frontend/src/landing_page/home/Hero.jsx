import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext.jsx";

const Hero = () => {
  const { user } = useAuth();

  return (
    <section className="px-4 pt-8 pb-16 sm:pt-10 sm:pb-20 lg:pt-12 lg:pb-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center mb-3">
          <div className="mb-10 w-full">
            <img
              src="main.png"
              alt="Investment platform illustration"
              className="mx-auto w-full max-w-md sm:max-w-lg lg:max-w-3xl"
            />
          </div>

          <div className="max-w-2xl">
            <h1 className="text-[1.65rem] font-medium tracking-tight text-gray-700 sm:text-4xl lg:text-3xl">
              Invest smarter, with complete control
            </h1>

            <p className="mt-6 text-md text-gray-600 sm:text-lg">
              Modern platforms to invest in stocks, derivatives, mutual funds,
              ETFs, bonds, and more. All with transparent pricing and zero
              compromises.
            </p>

            {!user && (
              <div className="mt-9">
                <Link
                  to="/signup"
                  className="rounded-md bg-blue-400 px-8 py-3 text-white font-medium shadow-sm transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                >
                  Sign up for free
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
