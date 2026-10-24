import { Link } from "react-router-dom";
const NotFound = () => (
  <main className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-3xl font-semibold mb-2">404 — Page not found</h1>
      <p className="text-slate-600 mb-4">Sorry, we couldn't find that page.</p>
      <Link to="/" className="text-blue-600 hover:underline">
        Go home
      </Link>
    </div>
  </main>
);

export default NotFound;
