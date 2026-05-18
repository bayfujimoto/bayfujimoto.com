# Admin passkey gate

The deployed `/admin` route and the two privileged write endpoints
(`/api/commit-all`, `/api/r2-upload-url`) are protected by a single mechanism: a
stateless HMAC-signed session cookie, issued only after a verified WebAuthn
passkey assertion. There is no password, no email, no recovery flow. Losing the
credential means re-registering from a trusted device with the one-time
`ALLOW_REGISTRATION` flag set.

This mechanism was ported from the CultToCanon project and adapted to this
archive: the cookie is `bf_sess`, the gate canvas is recolored to the admin's
cool-grey palette, and **both** privileged endpoints are gated (CultToCanon had
only one).

## 1. Threat model

The admin can write to the repo by calling `/api/commit-all`, which holds a
fine-grained GitHub PAT (`Contents: read & write` on this repo). It can also
call `/api/r2-upload-url`, which issues presigned write URLs to the Cloudflare
R2 bucket. Neither credential leaves the server; they are only readable inside
the Netlify Functions. The gate's job is narrow: prevent any unauthenticated
request from reaching the admin SPA's `localStorage` (in-progress drafts), the
commit endpoint (repo writes as Bay), or the R2 presign endpoint (bucket
writes).

The model assumes:

- The attacker cannot read environment variables on Netlify.
- The attacker cannot register a new passkey unprompted (registration is itself
  gated by `ALLOW_REGISTRATION`, unset except during deliberate provisioning).
- The attacker cannot forge an HMAC-SHA256 signature without `SESSION_SECRET`.
- A reader without the passkey is not categorically distinguished from a reader
  of the public site. The gate is unremarkable, not adversarial.

## 2. Components

```
Reader's browser
  /gate (gate.html → src/gate/main.js)
  ├─ src/gate/gate-canvas.js   press-and-hold dither canvas (admin palette)
  └─ src/gate/passkey.js       WebAuthn ceremony driver
  /admin (admin.html → src/admin/main.js)
  └─ bf_sess cookie sent on every fetch (httpOnly)
        │ HTTPS
        ▼
Netlify Edge
  netlify/edge-functions/admin-gate.js
    pure HMAC + exp check; pass-through or 302 → /gate
        │
        ▼
Netlify Functions
  /api/passkey/challenge          one-time auth challenge
  /api/passkey/verify             verify assertion, issue cookie
  /api/passkey/register/options   one-time registration setup
  /api/passkey/register/verify    verify attestation, store cred
  /api/logout                     clear cookie
  /api/commit-all                 GitHub write (cookie-gated)
  /api/r2-upload-url              R2 presign (cookie-gated)
        │
        ▼
Netlify Blobs
  passkeys/primary    the single registered credential
  challenges/<cid>    short-lived single-use challenges

  Local-dev fallback (BLOBS_DEV_SANDBOX=true)
  .netlify-blobs-dev/   filesystem sandbox via netlify/lib/fs-store.js
```

## 3. The session token

`netlify/lib/session.js` defines a stateless token:

```
Token = b64url(JSON{sub, iat, exp}) "." b64url(HMAC_SHA256(payload, secret))
```

Validation recomputes the HMAC and checks `exp` — no Blobs or network round
trip — so the Edge gate stays a constant-time crypto check. The token is set as
the `bf_sess` cookie with `httpOnly; SameSite=Strict; Path=/`, plus `Secure` on
HTTPS. Max age is 8 hours.

Signing uses `SESSION_SECRET`. Verification additionally accepts
`SESSION_SECRET_PREVIOUS` so live sessions survive exactly one secret rotation,
then expire naturally. The module uses Web Crypto only (no Node APIs) because
the Edge runtime is Deno and imports the same module verbatim.

## 4. Storage

Two Netlify Blobs stores (`netlify/lib/store.js`):

- `passkeys/primary` — a single credential record
  `{ credentialID, publicKey (base64), counter, transports, ... }`. The site is
  intentionally single-user; the credential lives at a fixed key.
- `challenges/<cid>` — short-lived (≤2 min) single-use challenges tagged
  `{ kind: "auth" | "reg", challenge, exp }`. Deleted after use regardless of
  outcome, so a challenge cannot be replayed.

Store resolution:

1. `NETLIFY_SITE_ID` + `NETLIFY_BLOBS_TOKEN` set → explicit real Blobs.
2. `BLOBS_DEV_SANDBOX=true` → `netlify/lib/fs-store.js` writes to
   `.netlify-blobs-dev/`. Used by unlinked `netlify dev`.
3. Otherwise `getStore(name)` → ambient real Blobs (deployed Functions, or
   `netlify dev` linked to the site).

`BLOBS_DEV_SANDBOX` is the only opt-in for the filesystem fallback, so
production can never silently downgrade to it.

## 5. Authentication flow

The user lands on `/gate`. The press-and-hold canvas
(`src/gate/gate-canvas.js`) dithers in with the same Bayer matrix the admin
uses, recolored to charcoal-on-cool-grey. Completing a ~1.25s hold fires
`onSuccess`:

1. Browser → `POST /api/passkey/challenge`. Server generates a fresh challenge,
   stores it at `challenges/<cid>` with `kind: "auth"` and a 2-minute `exp`,
   returns `{ cid, options }`.
2. Browser → `navigator.credentials.get({ publicKey })`. The platform/hardware
   authenticator signs the challenge.
3. Browser → `POST /api/passkey/verify { cid, assertion }`. Server fetches and
   deletes `challenges/<cid>` (single-use); checks `kind`/`exp`; fetches
   `passkeys/primary`; runs `verifyAuthenticationResponse` with the stored
   public key, expected origin, expected RPID; bumps the stored `counter`
   (replay protection); signs an 8-hour token; sets `Set-Cookie: bf_sess=…`.
4. Browser → `location.replace("/admin")`. The Edge Function now sees a valid
   cookie and lets the request through.

Failure at any step returns 401 with no cookie; the canvas resets so the rite
can be retried.

## 6. Registration flow

Registration is not public. It is reachable only by visiting `/gate?register`
*and* having the server-side `ALLOW_REGISTRATION` flag set to `true` for that
deploy.

1. `POST /api/passkey/register/options` returns `{ cid, options }`.
2. `navigator.credentials.create({ publicKey })` runs the attestation locally.
3. `POST /api/passkey/register/verify { cid, attestation }` checks the
   challenge, runs `verifyRegistrationResponse`, writes the credential to
   `passkeys/primary` (overwriting any prior one).

After a single successful registration, unset `ALLOW_REGISTRATION` on the
Netlify dashboard and redeploy. This is the only durable trust decision in the
system.

## 7. Local dev

Vanilla `npm run dev` (Vite alone) does **not** run the Edge Function or
Functions — admin is reachable directly and saves go to disk via the dev plugin
(`src/admin/plugin/github-write.js`). This is intentional: fast local work is
not gated.

To exercise the gate end-to-end locally, use the Netlify CLI. `.env`
(gitignored) sets:

```
SESSION_SECRET=<random 32+ bytes>   # openssl rand -base64 32
BLOBS_DEV_SANDBOX=true
ALLOW_REGISTRATION=false
```

`netlify/lib/rp.js` falls back to RP ID `localhost` and origin
`http://localhost:8888` when the `WEBAUTHN_*` vars are unset, which is what
`netlify dev` serves. A credential registered against `localhost` cannot
authenticate against the real site, and vice versa. Steps:

1. `ALLOW_REGISTRATION=true` in `.env`.
2. `npm run dev:netlify`.
3. Visit `http://localhost:8888/gate?register`, complete registration.
4. `ALLOW_REGISTRATION=false`, restart.
5. Visit `http://localhost:8888/gate`, complete auth, get redirected to
   `/admin`.

## 8. Production setup

Set in Netlify site settings:

- `SESSION_SECRET` — required, 32+ random bytes.
- `SESSION_SECRET_PREVIOUS` — optional, only during a rotation.
- `WEBAUTHN_RP_ID` — `bayfujimoto.netlify.app`
- `WEBAUTHN_RP_NAME` — `bayfujimoto archive`
- `WEBAUTHN_EXPECTED_ORIGIN` — `https://bayfujimoto.netlify.app`
- `ALLOW_REGISTRATION` — `true` only for the one-time registration, then unset
  and redeploy.

The site is currently served at the default Netlify subdomain
`bayfujimoto.netlify.app`; the `bayfujimoto.com` custom domain is not yet the
canonical host. RP ID is pinned to the exact host the ceremony runs on, so it
is `bayfujimoto.netlify.app`. **A passkey is bound to its RP ID and does not
transfer across domains:** if `bayfujimoto.com` is later made canonical, the
credential must be re-created against it — re-enable `ALLOW_REGISTRATION`,
register at the new host, then unset the flag again.

(`GITHUB_*`, `CLOUDFLARE_*`, `R2_*` are unchanged from before the gate.)

After deploy, perform the one-time production registration from Bay's device at
`https://bayfujimoto.netlify.app/gate?register`, then unset `ALLOW_REGISTRATION`
and
redeploy.

## 9. Operations: rotating `NETLIFY_BLOBS_TOKEN`

This site does not get ambient Netlify Blobs, so the passkey functions read and
write the credential store using an explicit Netlify **personal access token**
(PAT) in `NETLIFY_BLOBS_TOKEN`, plus `NETLIFY_SITE_ID`. This token is used on
**every gate login** (challenge + verify both touch Blobs), not just during
registration. If it expires or is revoked, the symptom is:

- `/gate` ceremony fails; `/api/passkey/challenge` returns HTTP 502 with
  `BlobsInternalError ... 401 status code`.
- Admin becomes unreachable (you can't pass the gate), but the public site is
  unaffected.

Rotate the token **before** a known expiry, or to recover from one:

1. Create a fresh PAT at <https://app.netlify.com/user/applications/personal>
   ("New access token"). Copy the **entire** value — it begins `nfp_`.
2. Validate it before deploying (a truncated copy returns 401):
   ```
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Authorization: Bearer nfp_THE_NEW_TOKEN" \
     https://api.netlify.com/api/v1/user
   ```
   Expect `200`. Anything else (e.g. `401`) means the token is bad — do not
   proceed; re-copy it.
3. Set it and redeploy so functions pick it up:
   ```
   netlify env:set NETLIFY_BLOBS_TOKEN 'nfp_THE_NEW_TOKEN' --context production --secret
   netlify api createSiteBuild --data '{"site_id":"03a7e0d3-5d7b-4784-98ca-f5ddea392ce5","clear_cache":true}'
   ```
4. After the deploy is `ready`, confirm the store is reachable again:
   ```
   curl -s -X POST https://bayfujimoto.netlify.app/api/passkey/challenge \
     -H "Content-Type: application/json" -d '{}'
   ```
   Expect HTTP `200` with `ok:true` (a credential is registered). A `502`
   `BlobsInternalError` means the new token is still not authorized.
5. Revoke the old PAT in the Netlify token list once the new one is confirmed.

Notes:
- A Netlify PAT is **account-wide**. Treat it as a high-value secret; it is
  stored as a Netlify secret env var, never committed.
- `SESSION_SECRET` is independent of this token. Rotating it (set
  `SESSION_SECRET_PREVIOUS` to the old value, `SESSION_SECRET` to a new one,
  redeploy) invalidates live sessions gracefully over one TTL; it does not
  require touching the passkey credential.
- The PAT cannot be deleted while the gate is in use — it is required at
  runtime, not just at setup. The only safe lifecycle is rotate-then-revoke.

## 10. Operations: moving to the `bayfujimoto.com` custom domain

A passkey is cryptographically bound to its **RP ID** (currently
`bayfujimoto.netlify.app`). It does not transfer to a different registrable
domain. If the site is moved so that `bayfujimoto.com` becomes the host the
admin is actually visited at, the existing credential **stops working** and a
new one must be registered against the new domain. Plan for a brief window
where you re-register.

Procedure:

1. Attach and verify `bayfujimoto.com` (+ `www`) as a custom domain in Netlify,
   with TLS issued, and decide the canonical host. Confirm which host the
   browser actually lands on:
   ```
   curl -s -o /dev/null -w "%{url_effective}\n" -L https://bayfujimoto.com/
   ```
   - If it stays on `https://bayfujimoto.com/` → origin is
     `https://bayfujimoto.com`.
   - If it redirects to `https://www.bayfujimoto.com/` → origin is
     `https://www.bayfujimoto.com`.
2. Update the WebAuthn env vars (RP ID is the registrable domain, no scheme, no
   `www`; origin is the exact canonical URL from step 1):
   ```
   netlify env:set WEBAUTHN_RP_ID bayfujimoto.com --context production
   netlify env:set WEBAUTHN_EXPECTED_ORIGIN https://www.bayfujimoto.com --context production
   #                                         ^ or https://bayfujimoto.com per step 1
   ```
3. Temporarily re-open registration and redeploy:
   ```
   netlify env:set ALLOW_REGISTRATION true --context production
   netlify api createSiteBuild --data '{"site_id":"03a7e0d3-5d7b-4784-98ca-f5ddea392ce5","clear_cache":true}'
   ```
4. After the deploy is `ready`, on the trusted device visit
   `https://<canonical-host>/gate?register` (use the canonical URL directly so
   there is no redirect mid-ceremony) and complete the press-and-hold
   registration. This **overwrites** `passkeys/primary` — the old
   `.netlify.app` credential is replaced; that is expected and intended.
5. Confirm `https://<canonical-host>/admin` → `/gate` → passkey → `/admin`
   works.
6. Lock down again:
   ```
   netlify env:unset ALLOW_REGISTRATION --context production
   netlify api createSiteBuild --data '{"site_id":"03a7e0d3-5d7b-4784-98ca-f5ddea392ce5","clear_cache":true}'
   ```
7. Verify registration is closed: `POST /api/passkey/register/options` returns
   HTTP `403` "Registration is disabled".

Then update §8 of this doc and `docs/admin-interface.md` to record the new
host. `NETLIFY_BLOBS_TOKEN` / `NETLIFY_SITE_ID` / `SESSION_SECRET` are
unaffected by a domain move — only the two `WEBAUTHN_*` values and the
credential change.

## 11. Why this shape

- **Stateless tokens** keep the Edge check fast and remove a hot path from
  Blobs.
- **httpOnly cookie** means the SPA never sees the token; XSS in the admin
  can't exfiltrate it.
- **Single-use challenges** prevent replay even if a TLS-terminating proxy is
  compromised mid-flight.
- **Single-credential store** matches the one-author model without inventing a
  multi-user system that would never be exercised.
- **`ALLOW_REGISTRATION` flag** turns registration into a deliberate one-time
  action requiring server access. There is no "forgot my passkey" link.
- **Same cookie for `/admin` and both write endpoints**: the Edge check
  protects the document, the function checks protect the actions. The Edge
  can't read a request body; a function can't intercept a directly-loaded SPA.
  Both layers are required.

Further reading: Yubico's WebAuthn primer
(<https://developers.yubico.com/WebAuthn/>); SimpleWebAuthn docs
(<https://simplewebauthn.dev/docs/>); OWASP *Authentication Cheat Sheet* §3 on
signed-cookie session design.
