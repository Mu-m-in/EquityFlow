# EquityFlow backend

## Render deployment

Create a Render Web Service rooted at `backend` with:

- Node.js: `^20.19.0 || >=22.12.0`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Render supplies `PORT`; do not override it in the Render environment settings.
The backend waits for MongoDB before listening, reports database readiness at
`/health` (including the current timestamp and process uptime), and handles
`SIGINT`/`SIGTERM` by closing HTTP and MongoDB connections. Configure UptimeRobot
to monitor `https://<your-render-service>.onrender.com/health`; the endpoint
returns `200` when MongoDB is ready and `503` otherwise.

Set these Render environment variables:

- `NODE_ENV=production`
- `MONGO_URL`: MongoDB Atlas connection URI for the EquityFlow database
- `JWT_SECRET`: unique cryptographically random secret of at least 32
  characters; never reuse the example value
- `FRONTEND_URL`: exact HTTPS public frontend origin
- `DASHBOARD_URL`: exact HTTPS dashboard origin
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAME_SITE`: `lax` for the recommended shared custom-domain
  setup; `none` for separate Vercel/Render default domains

Optional configuration:

- `JWT_EXPIRES_IN` (defaults to `1h`)
- `SESSION_COOKIE_MAX_AGE_MS` (defaults to one hour)
- `PAPER_STARTING_CASH` (defaults to `100000`; applies to new accounts)
- `ALPHA_VANTAGE_API_KEY` (market-data feature)
- `INDIA_MARKET_HOLIDAYS` (comma-separated `YYYY-MM-DD` exchange holidays)

Registration and login share a limit of 10 requests per IP address per
15-minute window, maintained in each backend process. If running multiple
instances, use a shared rate-limit store or equivalent edge protection.

For reliable cookie authentication, configure HTTPS custom domains under one
registrable domain, for example `app.equityflow.com`,
`dashboard.equityflow.com`, and `api.equityflow.com`. Set the two allowed origins
to the frontend and dashboard origins exactly (scheme and host, no path or
trailing route). Different Vercel and Render default domains are cross-site:
they require `SameSite=None; Secure`, and browser third-party-cookie blocking
can still prevent sessions from working. Verify cookies in real browsers
before launch.

Restrict MongoDB Atlas network access to the Render service's outbound IP
addresses where available. Avoid opening Atlas to `0.0.0.0/0` for production.
The paper-order endpoint uses MongoDB transactions, so use an Atlas
replica-set-capable cluster. No migration or seed command is required to start
the service; run any data setup separately and deliberately.

## Local development

Copy `.env.example` to `.env`, set a local/Atlas `MONGO_URL` and a private
development `JWT_SECRET`, and run `npm run dev`. The local `.env` is ignored by
Git. Use `npm test` to run the backend test suite.
