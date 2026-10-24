import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const OpenAccount = () => {
  const { user } = useAuth();

  return (
    <section className="max-w-2xl mx-auto px-4 my-10 flex flex-col items-center py-14">
      <h1 className="text-[1.65rem] font-medium tracking-tight text-gray-700 mb-2.5">
        Open an Account
      </h1>

      <p className="mt-4 text-base text-gray-600 mb-2.5 text-center">
        Professional trading tools, low-cost investing, and complete control
        over your portfolio. Start with zero barriers.
      </p>

      {!user && (
        <div className="mt-9">
          <Link
            to="/signup"
            className="rounded-md bg-blue-400 px-8 py-3 text-white font-medium shadow-sm transition hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 mb-2.5"
          >
            Sign up for free
          </Link>
        </div>
      )}
    </section>
  );
};

export default OpenAccount;
