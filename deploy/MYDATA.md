# AADE / myDATA integration

## Sources reviewed (17 November 2026)

- Official technical specifications: https://www.aade.gr/mydata/tehnikes-prodiagrafes-ekdoseis-mydata
- ERP API v2.0.2: https://www.aade.gr/sites/default/files/2026-09/myDATA%20API%20Documentation%20v2.0.2_official_erp_1.pdf (sections 4.2.8, 4.2.9 and 6.3).
- Published schemas: https://www.aade.gr/sites/default/files/2026-09/v2.0.2XSDs_0.zip
- GSIS OAuth2 service: https://www.gsis.gr/node/290/ . The documented service authenticates users for participating public bodies and returns identity information; it does not grant this private application generic access to tax debt or declarations.
- Supplemental cross-check of `RequestedBookInfo/bookInfo` response naming: https://github.com/firebed/aade-mydata/blob/master/src/Models/RequestedBookInfo.php . No library code copied.

## Implemented

Read-only `RequestMyIncome` and `RequestMyExpenses`, authenticated with `aade-user-id` and `ocp-apim-subscription-key`. Production base is `https://mydatapi.aade.gr/myDATA/`, sandbox base `https://mydataapidev.aade.gr/`. These are fixed in code; no custom destination or redirects are allowed. The user selects the environment explicitly; sandbox is labeled distinctly.

Dates are validated and encoded as `dd/MM/yyyy`; account AFM is supplied as `entityVatNumber`. Full continuation-token pagination is required before replacing the previous snapshot. Duplicate repeated rows are deduplicated, inconsistent duplicates and pagination loops fail. Failure in either direction preserves the last complete snapshot. Sync covers the selected date range and replaces the whole snapshot rather than appending another copy. A later shorter range intentionally replaces the previous longer range. Range, size, time and row/page bounds limit resource consumption.

`bookInfo` consists of grouped rows, not individual invoices. The dashboard labels this. Net/VAT amounts and signs are taken as returned by the API; VAT is not recomputed from a fixed rate. MARKs remain strings. Missing optional money fields are treated as zero. This is an overview of the API book values, not tax filing, liability calculation, payment status or a guarantee of accounting completeness. Complex invoice treatment must be checked against real books before reliance; no account-specific live result has been verified without user credentials.

No invoice transmission, cancellation, payment or classification write API is called. No Taxisnet passwords are collected. myAADE links are provided for official liabilities/declarations; there is no claimed Taxisnet/KEAO/EFKA integration. GSIS OAuth or another approved data service would require separate eligibility and service credentials; identity login alone would not provide debt data.

## Owner activation

One owner account protects real data. The first-start token is generated inside the writable `easyfinance_data` volume. The public app has no endpoint returning it. The administrator reads it privately through the VPS console:

```sh
docker exec easyfinance-app-1 cat /data/setup-token
```

Enter that token in the website's **Σύνδεση** dialog and choose a unique application username and password of at least 12 characters. Do not paste token, password or API key into chat. After account creation the token file is deleted and setup is closed. On **Ρυθμίσεις**, enter the AFM, myDATA REST API username and Subscription Key created on the official AADE site. Run a small date-range sync first, then the full required period. Production and sandbox require their respective credentials.

The account password is hashed with scrypt. Session cookies are Secure, HttpOnly, SameSite=Strict in production, expire after eight hours, and are invalidated on server restart. Mutations require the configured exact Origin and per-session CSRF token. Setup/login are rate-limited; only the app's reverse proxy is trusted for client address headers. App ports must not be published directly.

## Persistent encryption and backups

`/data/vault.key` encrypts `/data/state.enc` with AES-256-GCM, fresh IV per save and atomic file replacement. Credentials, owner configuration and the last snapshot are encrypted. API keys are never returned, logged or put in localStorage. The browser holds real rows in memory only; logging out returns to a separate local demo dataset.

This is server-side encryption, not end-to-end encryption: a server administrator or compromise of the running app can access the key. Both key and encrypted state must be backed up together. The named `easyfinance_data` volume is essential; never use `compose down -v`. Same-VPS backups must include that volume and be protected as secrets. Existing retention is seven days; disconnect deletes active credentials/snapshot but historical backups expire on schedule. Off-host backup remains a separate requirement.

Changing `PUBLIC_ORIGIN` is required when moving to another hostname. No auth secrets belong in Compose, Git or image layers. Initial volume ownership must be UID/GID 1000 with mode 700, using a one-off administrative initialization container before first app start; the application remains unprivileged and read-only outside `/data` and tmpfs.

## Validation

`npm ci`, `npm run check`, `npm test`. Automated tests use synthetic XML modeled on official fields and mocked AADE responses, not a live user account. They exercise namespace handling, exact VAT, signed amounts, large MARKs, paging, malformed XML/DTDs, credentials/rate errors, encryption, authentication, CSRF, persistence and preservation on failed sync. Browser checks exercise owner activation, secret entry/clearing, sync, reload, logout and responsive views. A real successful AADE response must still be verified with the owner's credentials.

## Live-account correction, 17 November 2026

AADE income responses returned a serialized `<string>` envelope when the client explicitly requested `Accept: application/xml`. Using the API's default content negotiation returned the documented `RequestedBookInfo`. Removed the extra Accept header from book and VAT clients. Verified a saved production connection read-only: both book groups and VAT rows were successfully retrieved for the current-year period. No credential values or monetary values were printed. The known misplaced ordinary Taxisnet credentials were removed from the active registry configuration; existing encrypted backups follow their retention policy.
