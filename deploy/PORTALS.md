# Official services and assisted portal connections

This extends the existing myDATA integration. It does not establish feature parity with an authenticated third-party product until the owner's actual account views have been compared. Public login-page tests are distinct from successful financial-data retrieval.

## Available flows

- **Business AFM:** owner can save their AFM independently of API credentials, so a portal connection does not require creating myDATA or registry codes first.
- **AADE registry:** official RgWsPublic2 SOAP service. Uses separate registry-specific username/password from the official special-code console, not the ordinary Taxisnet password. Supports the business AFM, name, tax office, address, status and activities. Credentials and results use the encrypted vault. An authenticated lookup still requires owner-provided special codes.
- **VAT book details:** official RequestVatInfo with existing myDATA credentials, grouped by day, with full continuation handling. Canceled records are excluded from field totals and missing codes stay absent. These fields are invoice-derived; they are not filed VAT returns or payable debt.
- **Portal views:** separate myAADE debt, myAADE VAT-return, KEAO and EFKA views. The owner interacts with an official-domain browser session on the VPS through an authenticated screenshot/control interface. No public VNC or debugging port is exposed. First login and any additional verification are completed by the owner. Normal Taxisnet passwords typed into the session are not saved by the application.

## Current portal capture scope

The EFKA frontend publicly references authenticated debt/installment/contribution endpoints. The worker passively retains small successful responses from an explicit read-endpoint allowlist when the official page itself requests them. It does not call arbitrary private endpoints or collect payment/credential responses. This is a session-bound web connector, not a documented external business API; account-specific schema normalization still needs live validation.


Capture records the currently visible page's rendered text, up to twelve tables (first 100 rows / 20 cells each) and a viewport screenshot. A downloaded PDF up to 2 MiB can be retained and served to the authenticated owner as an attachment. PDF text is extracted to help verify the AFM. The snapshot is explicitly labeled as a page view, not a complete audit of all liabilities. Paged or virtualized lists and other portal sections require navigation to the desired view. Each connector retains its latest captured view; it is not a document archive.

AFM must match the business on a captured page/PDF, or have been verified within the same recent session. An expired login, blocked destination, unverified AFM, malformed official response or failed capture must preserve the previous successful snapshot. Different connector views remain separate so a VAT-return capture does not replace a tax-debt capture.

The worker stores browser profiles only in tmpfs while active. After successful capture, cookies/storage and the last page URL are returned privately to the app and encrypted in the vault for the next opening. The API never returns browser session state to the frontend. Session expiry, portal changes, extra verification, and service restrictions may require user reconnection. The saved view can be refreshed on demand using the stored session and last URL; failure preserves the old view and prompts reconnection. No authenticated account-specific selectors, automatic complete debt aggregation or unattended refresh schedule have been validated yet.

## Resource and trust boundaries

One full-display Chromium browser runs at a time under a private virtual display. No stealth patches or authentication bypasses are used. Idle browser cleanup is based on user activity rather than screenshot polling. App and worker have separate memory/PID/CPU limits. Worker image uses Debian's signed Chromium/poppler packages and pinned Playwright. Browser runs unprivileged inside a read-only container with dropped capabilities; Chromium's inner sandbox is disabled for this container configuration, so container isolation is the relevant boundary. Treat the worker as handling sensitive session authority. It can access only its internal API token mount, not the app vault key/data volume.

Worker navigation is restricted to the configured AADE/GSIS/e-EFKA/EFKA HTTPS domains, credential-bearing URLs and arbitrary destinations are rejected. Obvious final tax-submission, payment and deletion controls are blocked; there is no financial submission API or automated submission flow. This is not a general policy engine capable of proving every third-party UI action read-only. Use it for login and data viewing/capture only.

Internal worker API uses a random shared token in `/srv/hosting/secrets/portal-token`, mounted read-only into app and worker. Worker publishes no host port and has a private app network plus a separate egress network. Never expose worker HTTP, browser CDP or VNC publicly. The app retains its login, exact-Origin checks, CSRF, Secure/HttpOnly cookies and no-store responses.

## Owner use

1. Activate the personal application account. Existing full setup codes remain valid; a 24-character prefix also works, and whitespace/case are normalized. Private VPS-console command:

   ```sh
   docker exec easyfinance-app-1 sh -c 'head -c 24 /data/setup-token; echo'
   ```

   Enter the result on the website, not in chat. Choose your own application password. Setup closes after the account is created.
2. In settings, save your business AFM. Add myDATA and registry-specific credentials only if using those official API connectors.
3. Under obligations choose the official service and open the connection. Click a field in the rendered screen, send text through the masked input, and use the visible official login controls. Additional authentication is a user step; it is not bypassed.
4. Open the actual account view you need. An AFM-bearing profile page may be required first for identity verification. Capture the displayed data, then navigate and capture other needed views separately. Close the portal to release browser resources.
5. Review captured source/date and content. A saved page is not a guarantee that all balances, pages or obligations were checked.

## Deployment / operations

The app uses the existing `easyfinance_data` encrypted volume. Worker profiles are ephemeral. Initialize the internal API token outside source control with mode 0400 / UID 1000 and preserve the directory with owner-only permissions. The deployment script creates it only when missing; never print it into logs or chat.

Build the worker before switching the app. Verify public official login screens without user credentials, measure runtime memory on this 1 GiB VPS, close the test browser, then deploy the web app. Keep prior source archives and image tags for rollback. Add the protected secrets directory to same-disk backups; app vault/session data already reside in the backed-up data volume. Copies of encrypted sessions remain in backup retention for up to seven days after disconnecting. Off-host backup remains outstanding.

Run `npm run check` and `npm test`. Browser tests for the app use mock portal responses and must not be described as successful taxpayer-account retrieval. A real first login and account-specific verification are required before claiming the debt/return integrations complete.

## Clear ordinary-Taxisnet entry

Settings now expose an explicit ordinary-Taxisnet connection button. Registry special codes are an optional collapsed section. The worker follows the public myAADE account menu (including its new window) or the EFKA Taxisnet provider choice. A normal username/password helper is shown only when a recognized official login endpoint contains the expected visible fields and a single login submit control. It is never used on password-change pages or arbitrary forms. The user explicitly submits their credentials; the app clears the password input and does not persist it. Actual MFA, consent and account verification remain user steps. Submission is not treated as proof of successful authentication; the official response remains visible.

## Automatic Taxisnet workflow

The default owner flow is now settings → ordinary Taxisnet username/password → connect and update. Obligations shows separate collection results for AADE debts, business profile, VAT returns, KEAO and individual EFKA contributions. Each job runs sequentially on the small VPS, outside the lifetime of the initiating HTTP request. A protected status endpoint supports polling and page reloads. myDATA synchronization is unchanged and independent.

The owner can opt into remembering the connection on this browser. The app seals the credentials using AES-256-GCM with fresh nonces and account/AFM/revocation-bound authenticated context; only the opaque envelope and username are stored in browser localStorage. The VPS necessarily receives the initial password over TLS to seal it, and decrypts it in memory during collection. It is not added to the server vault state. This is not end-to-end encryption against the VPS operator. Remembered envelopes require the corresponding vault key and can be revoked from settings. Browser storage and backups have the retention/security properties of those systems.

The collector uses recognized official login forms only. It navigates read-only controls, collects recognized financial tables and supported EFKA response shapes, follows accessible next-page controls with loop/size limits, and checks the AFM before saving. It does not submit tax returns, payments, or consent automatically. Failed auth stops further source attempts to reduce lockout risk. Additional verification pauses the job and opens the official screen only on owner request; closing that dialog preserves the pending browser so the same job can resume. Errors, identity mismatch, changed layouts and oversized/looped pagination preserve the prior successful source result.

The app does not infer zero debt from an error, login page or unknown response. Results carry per-source status, successful retrieval timestamp and coverage text. The current table collectors and EFKA schema support require account-specific validation; they are not a claim of complete taxpayer coverage. Employer APD/TEKA, every VAT return year/filter and every legacy AADE/EFKA layout are not yet verified. A rendered section may cover only its current official filters. Do not label feature parity or complete debt reconciliation as verified until the owner’s real-account comparisons pass.

Validation: backend tests cover authenticated access, CSRF, envelope integrity/revocation, no plaintext credential persistence, sequential source jobs, MFA pause/resume, rejection stopping further attempts, in-flight deletion, secret redaction and old-result preservation. Intercepted-browser fixtures exercise real collector code for normal login, regulated/unregulated debt navigation and pagination, plus AFM mismatch. UI fixtures exercise one-time connection, optional encrypted remembering, background results, MFA confirmation without restarting the session, reload, logout redaction and four viewport widths. None of these submit taxpayer credentials to a real service.

## AFM verification correction, 17 November 2026

The initial collector inspected only the top-level body's text, so an official framed profile or read-only identity field could fail verification. Identity detection now recognizes labeled Greek AFM with punctuation/spacing, checks official frames and visible read-only profile identity inputs, and waits for post-login rendering before following profile navigation. Editable counterparty search fields and untrusted frames are excluded. A known public myAADE entry page is retried for login and cannot be treated as an authenticated taxpayer page merely because it has no password input.

Identity failures retain only an encrypted diagnostic summary (official origin/path without query or long numeric path IDs, match/password/loading booleans and timestamp). No credentials, cookie values, AFM values, page body or financial amounts are stored in diagnostics or printed. A failed source still preserves its prior result. Diagnostics are cleared when disconnecting Taxisnet or changing AFM. Account-specific verification still requires a new owner-triggered attempt because the previous failed browser was already closed and no reusable authenticated session had been saved.

## Legacy Taxisnet home navigation

A real failure diagnostic located the owner flow at `https://www1.aade.gr/taxisnet/info/protected/home.htm` with no visible labeled AFM. No debt snapshot had been saved. The collector now normalizes Greek accents/case, recognizes accessible labels on image links and legacy input buttons, and includes `Στοιχεία Οφειλών` when entering debts. An intercepted browser regression uses that legacy home path with an uppercase image-only registry link and a debt input button. It exercises profile verification before debt collection; it does not establish success on the live taxpayer account.

If identity still cannot be verified, a failed login's browser storage can be retained separately as an unverified troubleshooting session in the encrypted vault. It is never exposed by the status API, never used as AFM proof, and is eligible for retry only for fifteen minutes. Disconnecting Taxisnet or changing AFM deletes it; encrypted backup copies follow existing retention. This allows read-only investigation without saving the ordinary Taxisnet password or asking the owner to repeatedly provide it. Diagnostics additionally record navigation categories/official paths and error/session-notice booleans, without control values, page bodies, account names or financial amounts.

## Authentication diagnosis

Authentication failures previously had no persisted attempt record, so unchanged AFM diagnostics could not establish whether a newer request had run. Each source now records a sanitized attempt status/timestamp/code and a credential-presence boolean. Authentication-stage diagnostics are separate from identity-stage diagnostics. No username, password, token, cookie, form value or monetary value is included in these records.

Credential rejection is now recognized only in visible error regions of a verified official login form. Generic body text and conditional help/warning text are not sufficient. A recognized locked account stops subsequent source attempts; missing credentials are a separate local condition. Ambiguous login/verification state requests confirmation rather than claiming rejection. A failed browser can remain briefly available for read-only inspection and follows the existing idle timeout; rejected form fields are cleared. The worker's bearer-protected private `/inspect` route exposes only sanitized current-page/diagnostic metadata and is not routed by the public app.

A fresh public myAADE login-form probe on 17 November 2026 found the expected username/password inputs, no visible error regions and no default rejection match. This does not validate the owner's credentials or establish the cause of their reported login rejection. The owner must confirm whether the same credentials succeed directly on the official service; do not repeatedly try a rejected password automatically.

## Real-account verification: legacy tax-debt views

With the owner's explicit permission, the real troubleshooting session was inspected on the VPS. The legacy `info/protected/home.htm` is a debt navigation page and did not contain the taxpayer AFM. The observed read destinations were `displayDebtInfoAndPay.htm` and `displayArrangementInfoAndPay.htm`; both actual pages contained the configured taxpayer identity and passed exact AFM verification. The collector now reaches those explicit official read views before identity verification. The `AndPay` filename is not an instruction to pay: only GET navigation to the two allowlisted display routes is performed; payment forms and actions are never submitted. This also avoids rejecting a legitimate display link merely because its navigation label mentions payment.

Generic nested layout tables are excluded to avoid duplicating the same rendered data. Explicit empty-state notices remain separate from unknown or conditional help text. The arrangement display route is recognized as a debt source even when the legacy layout has no semantic heading element.

A live end-to-end collector check returned success, verified identity and both distinct official source sections. The verification output contained only status/count/source metadata; no taxpayer AFM, account name, debt amount, password, cookie or full page was exported. This validates the two observed tax-debt sections, not every other source, employer obligations or complete account reconciliation. Fixtures reproduce a legacy home without AFM, financial display links mentioning payment, taxpayer verification on the read view, and zero POST/payment submissions.

For this owner-requested manual investigation, the recent encrypted troubleshooting session was used on the VPS after the application's fifteen-minute automatic reuse window; the automatic limit was not changed. The official service still determined whether the session remained authenticated. The successful result is stored only in the app's encrypted vault, with the normal AFM checks and previous myDATA data preserved.

## Source-specific remaining connectors

VAT, individual EFKA and KEAO collection use separate modules with fixture tests. VAT enters the official AADE application linked from `https://www.aade.gr/diloseis-fpa-vies`. A real-session structural check identified periodic F2 as GET form `gotovatF2`, declarationType `vatF2`, targeting `displayLiabilitiesForYear.htm`. F1, F4, F5 and Charter forms and the POST `submit-flow.htm` are excluded. The selected year and existing hidden GET fields stay within the official request. VAT identity is checked again after navigation. Listing/status rows are distinct from a verified payable/credit balance; unknown balances remain unknown.

EFKA reads a fresh, schema-checked individual-contribution response; KEAO separates summary, debts and installments without summing overlapping data. A missing, stale or malformed response is not zero debt. Individual EFKA does not establish employer APD/TEKA coverage, and unrecognized KEAO detail schemas remain unknown. General terms links do not count as blocking consent; actual role/verification prompts pause for the owner. Verified sessions may be reused only within the AADE family or EFKA family for the same AFM, with source identity checks retained.

An owner-authorized live access probe found that the current AADE session reaches the VAT app and verifies the configured AFM. The same session reaches an unauthenticated official EFKA login form, not an authenticated EFKA account. EFKA/KEAO real-data completeness therefore cannot be claimed from that probe or from fixtures. A new owner-triggered all-source update with ordinary Taxisnet credentials is required for their real-account validation; credentials are never requested in chat.

The periodic F2 VAT collector was subsequently validated end-to-end with the owner's existing real AADE session: the result succeeded and matched the configured AFM. Validation output was limited to a fixed success/code/identity flag and section count. This establishes access to the selected-year declaration-status listing; it does not establish a payable/credit balance or complete historical coverage. The protected UI includes a single remaining-sources action (VAT, KEAO, EFKA), preserving that selection if a Taxisnet credential form is needed first. EFKA/KEAO still require a real authenticated session before their account data can be labeled verified.


## Employer route correction (17 November 2026)

The owner demonstrated GSIS EFKA registry consent, AFM confirmation, and an eventual common-services page containing funeral/receipt services. This was not evidence of financial-data access. The public EFKA dashboard bundle redirects roles outside the insured-person allowlist to that page; the owner's actual role was not exported or inferred.

A separate `employer` source now enters the official employer financial-card application, `https://services.e-efka.gov.gr/ssp.efka.emp-transactions-ext/`, linked by `https://www.efka.gov.gr/el/ergodotes/oikonomike-kartela-ergodote`. The existing individual contribution source remains separately labeled. The remaining-sources button selects VAT, employer EFKA and KEAO. KEAO now enters the debtor platform published in the official application bundle, `https://services.e-efka.gov.gr/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml`. Its official August 2026 manual describes Taxisnet authentication and debtor-registry selection. Registry choice is left to the owner; table rows and overlapping totals are not summed.

The owner explicitly authorized the two authentication actions: EFKA GSIS registry consent `Αποστολή` with `Συνέχεια` selected, then the matching read-only AFM confirmation `Υποβολή`. Recognition is restricted to EFKA authentication routes/content and the expected AFM, not arbitrary submission controls. CAPTCHA/OTP and ambiguous role/registry choices remain user actions. The confirmation route restriction remains unverified against a real authenticated confirmation screen; an unrecognized variant stops for verification.

A VPS-only route probe confirmed that both financial entry points reach the official GSIS password form. Existing troubleshooting cookies did not authenticate those entries. Real employer financial-card content and selected KEAO debtor tables have therefore not been validated. Fixture tests are not a substitute for real-account verification. Existing verified VAT, tax-debt and myDATA snapshots remain unchanged.
