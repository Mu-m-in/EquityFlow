# TradeHub authentication POC

This isolated proof of concept tests whether a top-level navigation to a
separate Render service can restore a dashboard session without relying on a
third-party cookie in dashboard API requests.

It does not use the EquityFlow database, production users, production JWTs, or
production API routes. The POC server accepts one separately configured test
account and serves only a harmless identity test endpoint. Do not use a real
account password or production secret.

## What this POC tests

1. The dashboard begins an authorization request using `state` and PKCE S256.
2. The browser navigates to the POC auth server as a top-level page.
3. The auth server validates the fixed callback URI. A POC-only test account
   can sign in; the server sets a host-only HttpOnly session cookie.
4. The server returns a short-lived, single-use authorization code and state
   to the dashboard callback.
5. The dashboard validates state and exchanges the code and verifier directly
   with the POC server.
6. The dashboard keeps the short-lived access token only in memory and calls
   `/poc/api/whoami` using an Authorization Bearer header.
7. Refreshing the dashboard loses the access token and repeats the top-level
   authorization request. This tests whether the browser sends the POC cookie
   on that top-level navigation.

The code, session, and access-token stores are deliberately in memory and
single-process. Restarting the POC service clears them. This is not a
production session implementation.

## Local setup

Requirements: Node.js 20.19+ or 22.12+.

1. In `poc/tradehub-auth/backend`, install the POC dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env`. For example:

   ```sh
   cp .env.example .env
   ```

   Replace the test password with a unique random POC-only password of at least
   16 characters and `POC_JWT_SECRET` with a separate random value of at least
   32 characters. Never use a production password or secret. The server refuses
   to start with the example placeholders.
3. For local testing, use the actual local origins you will run. For example:

   ```text
   POC_API_ORIGIN=http://localhost:4317
   POC_DASHBOARD_ORIGIN=http://localhost:5178
   POC_CALLBACK_URI=http://localhost:5178/
   ```

   The POC cookie is always marked `Secure`. Browsers generally permit Secure
   cookies on localhost, but localhost is only a development smoke test and
   does not establish Safari/Brave behavior for public HTTPS origins.
4. Start the server from `poc/tradehub-auth/backend`:

   ```sh
   npm start
   ```

5. Serve `poc/tradehub-auth/dashboard/` on the exact dashboard origin configured
   above. In another terminal, for example:

   ```sh
   cd poc/tradehub-auth/dashboard
   python3 -m http.server 5178 --bind 127.0.0.1
   ```

   Open `http://localhost:5178/`. The `auth-origin` meta value in `index.html`
   and the auth host in its Content Security Policy must match
   `POC_API_ORIGIN`.
6. The POC dashboard will begin the redirect flow automatically. Use the
   separately configured POC test email and password on the POC server's
   login page.

The POC server requires an HTTPS origin for non-local hosts. It does not permit
wildcard callback URIs or wildcard CORS. Keep `.env` out of source control.

## Browser testing

To test Safari and Brave Shields reliably, the POC needs two temporary HTTPS
origins: one for this POC server on a separate Render service and one for the
static POC dashboard on a separate Vercel project or equivalent static host.
Do not point either project at the production API or existing application.
The hostnames must be distinct from the existing deployments; this lets the
browser test cross-site top-level navigation and direct cross-origin API calls.

Creating those temporary projects, configuring their POC-only environment
variables, or deploying them is not authorized by approval to create these
source files. Obtain separate approval first. No existing Render/Vercel project
or setting needs to be changed.

When separately approved, configure the temporary Render service to use
`poc/tradehub-auth/backend` as its root and `npm start` as its start command.
Set its `POC_API_ORIGIN`, `POC_DASHBOARD_ORIGIN`, `POC_CALLBACK_URI`,
`POC_TEST_EMAIL`, `POC_TEST_PASSWORD`, and `POC_JWT_SECRET` to POC-only values.
Keep one service instance because the POC session and one-time code stores are
in memory. Configure the temporary static project to serve
`poc/tradehub-auth/dashboard` without a build step. Replace the placeholder
auth origin in both the `auth-origin` meta tag and the Content Security Policy
in `index.html` with the temporary Render service origin. The callback URI
must be exactly the dashboard origin followed by `/`.

For each browser, use a fresh profile and record:

- Initial dashboard navigation, POC login, callback, and successful Bearer
  request.
- Whether the POC cookie is stored and sent on the next top-level navigation
  to the POC auth origin. Inspect the network request in developer tools; the
  cookie is HttpOnly and cannot be inspected by dashboard JavaScript.
- Dashboard refresh and whether it returns authenticated without another
  password entry.
- Brave Shields disabled and enabled; Safari macOS and iOS (use Web Inspector
  for iOS).
- Cookie deletion/expiry, service restart, and a session that is no longer
  available.
- Wrong state, wrong PKCE verifier, expired code, replayed code, and a
  non-allowlisted callback URI. Each must fail without issuing an access token.
- The identity endpoint succeeds with a valid Bearer token and fails without
  one, with a malformed token, or after the token/session expires.
- The callback URL is cleaned after exchange; no access token or session
  credential appears in a URL, browser history, or application log.

This tests the flow on the POC hostnames. A successful result does not prove
that Safari or Brave treats `equityflow-fhkv.onrender.com` identically; the
POC intentionally does not add routes to that production host.

## Cookie and browser limitations

The POC session cookie is named `equityflow_tradehub_poc_session` and is
host-only (no `Domain` attribute), `HttpOnly`, `Secure`, `SameSite=Lax`, scoped
to `/poc/`, and short-lived. `SameSite=Lax` is intended for the top-level GET
authorization navigation. The dashboard's code exchange and resource requests
do not use cookies; they use PKCE and a Bearer access token instead.

This design tests whether a top-level round trip helps where a cross-site
`fetch` cookie is blocked. It does not guarantee success: Safari tracking
prevention, Brave Shields, and other privacy controls can still limit cookies
or redirect-based session restoration. Browser behavior must be observed on
the target versions and hostnames.

The access token is an independently signed POC JWT, kept in memory and valid
for only a few minutes. Refresh intentionally discards it and requires another
top-level authorization round trip. A persistent POC session survives only
while the POC server's in-memory session remains and the browser retains the
cookie.

## Cleanup

1. Stop the local POC server and static server.
2. If separately approved and created, delete the temporary POC Render and
   static-host projects and remove their POC-only environment variables and
   test account.
3. Remove only the `poc/tradehub-auth/` directory.
4. Run `git status --short` and confirm no POC files remain staged or
   untracked. Do not remove or alter any production project or source file.
