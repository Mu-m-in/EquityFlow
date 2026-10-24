import { Link } from "react-router-dom";
import StatsItem from "./StatsItem";
import { actionLinks, statsItems } from "./statsData";
import { useAuth } from "../../AuthContext.jsx";

const Stats = () => {
  const { user } = useAuth();
  const visibleActionLinks = user
    ? actionLinks.filter((link) => link.id !== "tradehub-demo")
    : actionLinks;

  return (
    <section
      aria-labelledby="stats-heading"
      className="mx-auto max-w-6xl px-4 py-4 flex flex-col min-[800px]:flex-row justify-between gap-8 text-justify"
    >
      <div className="w-full lg:w-[40%] flex flex-col gap-8">
        <div>
          <h2
            id="stats-heading"
            className="text-[1.65rem] font-medium text-[#424242]"
          >
            Trust with confidence
          </h2>
        </div>

        <div className="flex flex-col gap-8">
          {statsItems.map((item) => (
            <StatsItem
              key={item.id}
              title={item.title}
              description={item.description}
            />
          ))}
        </div>
      </div>

      <aside className="w-full lg:w-[55%] flex flex-col justify-center items-center mt-10 min-[800px]:mt-0">
        <img
          src="/whyus.png"
          alt="Illustration showing trust and product confidence"
          className="w-full"
        />

        <div className="flex flex-wrap justify-center gap-10 mt-10">
          {visibleActionLinks.map((link) => (
            <Link
              key={link.id}
              to={link.href}
              className="text-[#387ed1] text-base hover:text-black transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </aside>
    </section>
  );
};

export default Stats;
