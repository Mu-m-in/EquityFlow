# TradeHub paper-trading dashboard

## Vercel deployment

Create a separate Vercel project for this directory with:

- Root Directory: `dashboard`
- Framework Preset: Vite
- Node.js: `^20.19.0 || >=22.12.0`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

Set these build-time environment variables to the exact HTTPS origins:

- `VITE_API_URL`: Render backend origin, for example `https://api.tradehub.com`
- `VITE_FRONTEND_URL`: public frontend origin, for example `https://app.tradehub.com`

The Vite production build fails if either variable is missing, malformed, or
not HTTPS. Do not put backend credentials, JWT secrets, database URLs, or
market-data API keys in `VITE_*` variables; Vite embeds them in public assets.
`VITE_DEV_PORT` is for local development only.

The dashboard uses client-side routes. Keep Vercel's Vite SPA handling
enabled; no custom rewrite file is required for the standard Vite project
configuration. Configure the dashboard's custom domain in Vercel and set the
exact same origin as `DASHBOARD_URL` on Render.

## Authentication and cookies

The dashboard checks the API session on load and redirects unauthenticated
users to the public frontend. API requests include credentials and use the
HttpOnly session cookie. For reliable cross-subdomain cookies, use HTTPS custom
domains under one registrable domain, such as `app.tradehub.com`,
`dashboard.tradehub.com`, and `api.tradehub.com`. For that arrangement,
`SameSite=Lax` is suitable. The API's CORS allowlist must contain the exact
frontend and dashboard origins.

If using the default Vercel and Render hostnames, they are different sites and
the API cookie requires `SameSite=None; Secure`. Browsers and privacy settings
may still block third-party cookies in that arrangement. Test sign-in, refresh,
and logout in the target browsers; custom domains sharing a registrable domain
are the recommended production setup.

## Local development

Copy the relevant values from `.env.example` into `.env.development` and use
the local backend URL. Run `npm run dev` from this directory.
