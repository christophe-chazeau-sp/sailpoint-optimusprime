# Tenant check

Scripts that compare the app's local transform evaluator with what an Identity Security Cloud tenant
actually returns, so behavior differences show up as failing tests instead of surprises in production.

## How it works

The identity profile preview endpoint (`POST /v3/identity-profiles/identity-preview`) calculates
mappings for one identity without saving anything. It does not accept inline transform definitions,
only references to transforms saved in the tenant, so `run-tenant.mjs`:

1. Saves each case from `cases.mjs` as a temporary transform named `optimusprime-case-N`.
2. Runs one preview on the test identity, mapping each case to a different identity attribute
   through `{ "type": "reference", "attributes": { "id": "optimusprime-case-N" } }`.
3. Records each attribute's value or error message in `tenant-results.json`.
4. Deletes the temporary transforms, even when a step fails.

Every case puts its input values inside the transform (for example `"input": "ÉLODIE"`), so the
result does not depend on the identity's data. The one exception is `middleName`, which is empty on
the test identity and serves as the source of `null` values.

`make-fixture.mjs` then turns `cases.mjs` and `tenant-results.json` into
`src/app/transform/evaluator/tenant-cases.ts`, which `tenant.spec.ts` checks on every `ng test` run:
the local evaluator must return the same value as the tenant, or fail where the tenant failed.

## Running it

The scripts read the tenant and a short-lived access token from files outside the repository, so no
credential is ever committed:

```powershell
New-Item -ItemType Directory -Force "$env:LOCALAPPDATA\Temp\.isc" | Out-Null
Set-Content "$env:LOCALAPPDATA\Temp\.isc\tenant" "company1234-poc.identitynow-demo.com"
Read-Host "Paste the JWT" | Set-Content "$env:LOCALAPPDATA\Temp\.isc\token"
```

The tenant file holds the tenant's host name; the API host is derived from it
(`company1234-poc.api.identitynow-demo.com`). The token is a user access token (JWT), for example
the `accessToken` returned by `https://<tenant>/ui/session` while signed in. It expires after about
12 minutes, so write it just before running:

```powershell
node tenant-check/run-tenant.mjs      # calls the tenant, writes tenant-results.json
node tenant-check/make-fixture.mjs    # regenerates tenant-cases.ts
npx ng test --watch=false             # tenant.spec.ts reports any disagreement
```

`run-tenant.mjs` uses a fixed test identity (`identityId`) and a list of identity attribute names
to map cases to. Change them for another tenant. Use a sandbox or demo tenant: the script creates
and deletes transforms.

## Adding a case

Add a `[label, transform]` entry to `CASES` in `cases.mjs`, rerun the three commands above, and fix
the evaluator until `tenant.spec.ts` passes. One preview handles up to one case per mapped
attribute; the script splits larger lists into several previews.

## What the tenant showed

Findings from the first runs, now reflected in the evaluator:

- `join` prints a `null` value as the text `null`; `concat` skips it.
- Velocity runs in strict mode: printing an undefined or `null` reference is an error, even
  written `$!x`. This includes `#set($forceNull = null)$forceNull`, also inside a `replace`
  replacement, even when the regex does not match.
- In `#if`, only `null` and `false` are false; an empty string is true.
- `split` treats the delimiter as a regex, drops trailing empty parts like Java, and fails when the
  index is past the end unless `throws` is `false`.
- `dateFormat` with input format `ISO8601` only accepts `yyyy-MM-ddTHH:mm:ss.SSS` plus a zone. Any
  input that does not match its format returns `null` without an error. Output `ISO8601` includes
  milliseconds, and the `z` letter prints `GMT`.
- `dateMath` prints Java's form (`2026-02-28T00:00Z`), clamps month ends (Jan 31 + 1M = Feb 28),
  and rounds up to the start of the next unit.
