import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTwitter,
  faLinkedinIn,
  faInstagram,
  faFacebookF,
} from "@fortawesome/free-brands-svg-icons";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const Footer = () => {
  const { user } = useAuth();

  return (
    <footer className="bg-gray-100 text-slate-700 py-8">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div className="text-center md:text-left">
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-4">
              Quick links
            </h2>
            <div className="flex flex-wrap flex-col justify-center gap-3 text-sm text-slate-600 md:justify-start">
              <Link to="/" className="transition hover:text-slate-900">
                Home
              </Link>
              <Link to="/product" className="transition hover:text-slate-900">
                Products
              </Link>
              <Link to="/pricing" className="transition hover:text-slate-900">
                Pricing
              </Link>
              <Link to="/support" className="transition hover:text-slate-900">
                Support
              </Link>
              {!user && (
                <Link to="/signup" className="transition hover:text-slate-900">
                  Signup
                </Link>
              )}
            </div>
          </div>

          <div className="text-center md:text-right">
            <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 mb-4">
              Connect with us
            </h2>
            <div className="inline-flex items-center justify-center gap-3">
              <a
                href="https://twitter.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Twitter"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faTwitter} className="h-5 w-5" />
              </a>
              <a
                href="https://linkedin.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faLinkedinIn} className="h-5 w-5" />
              </a>
              <a
                href="https://instagram.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faInstagram} className="h-5 w-5" />
              </a>
              <a
                href="https://facebook.com/"
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faFacebookF} className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
          <p>© 2026 EquityFlow. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
