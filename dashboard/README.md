# TradeHub paper-trading dashboard

## Vercel deployment

Create a separate Vercel project for this directory with:

- Root Directory: `dashboard`
- Framework Preset: Vite
- Node.js: `^20.19.0 || >=22.12.0`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Dashboard API requests use same-origin `/api` paths. A Vercel Node function
proxies the supported dashboard endpoints to the fixed Render backend. No
`VITE_API_URL` or `VITE_FRONTEND_URL` build variables are needed. Do not put
backend credentials, JWT secrets, database URLs, or market-data API keys in
`VITE_*` variables; Vite embeds them in public assets. `VITE_DEV_PORT` is for
local development only.

The dashboard uses client-side routes. Keep the existing SPA fallback rewrite
in `vercel.json`; Vercel's filesystem routing sends `/api/*` to the serverless
function before applying that fallback. Configure the dashboard's production
URL to match `DASHBOARD_URL` on the backend.

## Authentication and cookies

The dashboard checks the API session on load and redirects unauthenticated
users to the public frontend. API requests include credentials and use the
HttpOnly session cookie. The backend's existing exact Origin and CORS checks
remain in place for both applications.

The proxy validates the exact browser Origin against the deployed dashboard
URL, forwards the canonical dashboard Origin to the backend, and relays
`Set-Cookie` without adding a `Domain` attribute. The browser therefore stores
the `HttpOnly; Secure; SameSite=None` dashboard cookie on the dashboard host
and sends it same-origin to `/api`; it is not a third-party cookie. The main
website's authentication cookie is not forwarded.

Production requests use the fixed Render backend origin. Non-production
serverless deployments fail closed unless the server-only
`TRADEHUB_API_ORIGIN` variable is set to an isolated HTTPS staging or mock API.
Configure that variable for the Preview environment only; do not point a
Preview deployment at production data while testing. The proxy accepts only
the exact production dashboard origin and Vercel-provided deployment/branch
origins, never a client-supplied upstream.

For a temporary Preview connection to the production API, set the Preview-only
server environment variables `TRADEHUB_API_ORIGIN=https://equityflow-fhkv.onrender.com`
and `ALLOW_PRODUCTION_PREVIEW_API=true`. The flag is disabled unless its value
is exactly `true`. Preview requests remain read-only: only dashboard login,
logout, and existing GET/HEAD endpoints are forwarded; order, watchlist, and
other mutations are rejected. Unset the opt-in after testing. Neither variable
is exposed to frontend JavaScript.

## Local development

Run `npm run dev` from this directory. Vite proxies `/api` to
`http://localhost:3002` by default; set `TRADEHUB_API_ORIGIN` to use an isolated
local mock backend. Set `VITE_DEV_PORT` to the same port configured as the
backend's local `DASHBOARD_URL` (the example backend configuration uses 5174).
Do not use production credentials or data.

For a Vercel Preview, configure `TRADEHUB_API_ORIGIN` in the Preview
environment to the isolated HTTPS mock or staging API before exercising the
proxy. Leave it unset for production, which uses the fixed Render API origin.
Set the staging API's exact `DASHBOARD_URL` to
`https://equityflow-dashboard.vercel.app`; the proxy validates the Preview
Origin itself and forwards that canonical Origin to the backend.
