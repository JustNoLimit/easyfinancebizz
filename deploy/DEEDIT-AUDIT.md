# DEEDIT Business public-surface audit

17 November 2026. Scope: public frontend and previously captured public pages, plus the owner's screenshots. No account, credentials, protected vendor APIs or source maps were accessed for this audit. Direct workspace requests returned proxy HTTP 503. Both public homepages were subsequently retrieved successfully through the VPS without login or cookies, together with three normally linked marketing JavaScript assets. The workspace disconnected before the requested legal/product lazy modules could be retrieved and reviewed. The detailed business-client findings below still rely on earlier public asset copies; fresh byte comparison of those modules was not completed. No claim is made that current policy, FAQ or product pages were exhaustively inspected. The earlier, broader [feature comparison](FEATURE-COMPARISON.md) and [Taxisnet research](TAXISNET-RESEARCH.md) remain useful; this audit adds request and eligibility details.

## Core findings and evidence

The [public business client service module](https://app.deedit-business.evolluto.com/chunk-CRcC6bCG.js) constructs a shared debt refresh request from the saved Taxisnet credential object plus business profile ID:

```json
{"username":"<ordinary Taxisnet username>","password":"<vendor-encrypted password>","userDetailsId":"<business profile id>"}
```

These are field names and client-side construction, not a tested API contract or real credentials. The client POSTs that same object to its **own vendor backend**, `https://api.deedit-business.evolluto.com`, under `debts`, `debts/keao`, `debts/efka-apd`, and `debts/efka`, then GETs `debts` with `userDetailsId` to read stored results. Calls are concurrent and each refresh subsequently reads saved results, including after a caught refresh error. This does not prove freshness, correctness, backend upstream host, authentication method or successful employer access.

| Client refresh | Eligibility in the inspected code | Meaning and limits |
| --- | --- | --- |
| AADE / ΔΟΥ debts | Business profile ID and stored Taxisnet credentials | Always included when those prerequisites exist. |
| KEAO | AMKA **or** AME **or** one or more AMOE | A client gate, not proof of debtor registration or absence of debt. |
| Employer APD | AME **or** one or more AMOE | Same Taxisnet credential object is sent to the vendor. This path contains no separate employer username/password field; backend use of other authority or credentials is unknown. |
| Individual EFKA | AMKA **and** business type exactly `ΑΤΟΜΙΚΗ ΕΠΙΧΕΙΡΗΣΗ` | This client rule excludes a corporate profile from this particular individual refresh; it does not establish any general legal eligibility rule. |
| VAT status | Profile ID, stored Taxisnet credentials, and populated VAT applicability, tax category and VAT type | Uses `vat-info` on the vendor backend. Client computes VAT-enabled separately and excludes specified exemption/small-business categories. |

The [profile module](https://app.deedit-business.evolluto.com/chunk-DK2TJYyq.js) permits AMKA and AME editing and adding/removing multiple AMOE. The [obligations module](https://app.deedit-business.evolluto.com/chunk-BtQGTxuH.js) expects `efkaApdDebts` and `tekaApdDebts`. It displays employer IKA and TEKA contributions separately, filters common-business entries by `role === 'Εργοδότης Κοινής Επιχείρησης'`, and construction entries by `role === 'Υπόχρεος Οικοδομοτεχνικού'`, grouping construction records by `am` and summing `amount`. These are observed UI model fields, not a complete upstream response schema. In particular, the observed APD model does **not** establish that the official employer financial-card route in our current connector supplies equivalent data. An access-denied screenshot for that route does not identify why access failed or prove DEEDIT uses it.

## Credentials and trust boundary

The owner-provided screenshots show business AFM and ordinary Taxisnet credentials for business/tax/debt information, and separate myDATA REST API username plus subscription key for income and expenses. The public client supports that distinction. AFM identifies the business; AMKA/AME/AMOE are profile identifiers used in the gates above, not passwords. A myDATA subscription key is not shown as a substitute for the Taxisnet debt request. DEEDIT account login is another separate credential.

The client sends `{password: <entered password>}` to the vendor `credentials/encrypt-password` endpoint and stores the returned `password`, alongside the Taxisnet username, in browser `localStorage` under a profile-scoped `.aade` key. On debt refresh it sends the stored value to its backend. The analogous myDATA service sends its subscription key to the same named vendor encryption route and stores the returned value with its username. Thus encryption is requested from the vendor server: the client code does not establish end-to-end encryption, algorithm, key custody, backend retention or upstream transport. The public client names the operation `encrypt-password` and handles an `INVALID_ENCRYPTED_CREDENTIALS` error; these are code observations, not an independently verified cryptographic claim. The settings UI states exactly: “Πρόκειται να διαγραφούν τα στοιχεία σύνδεσης Taxisnet που είναι αποθηκευμένα στη συσκευή σας.” It makes an equivalent device-storage statement for myDATA; deletion of localStorage does not prove deletion of backend copies or backups. No public privacy/terms or marketing encryption wording was accessible to quote or verify in this session. Sources: [credentials service](https://app.deedit-business.evolluto.com/chunk-CRcC6bCG.js), [settings](https://app.deedit-business.evolluto.com/chunk-DK2TJYyq.js).

## Feature coverage and applicability

| Area | Evidence and qualification |
| --- | --- |
| Business profile | Owner screenshots and profile client show AFM, company details and editable AMKA/AME/AMOE, category and VAT regime. |
| Income, expenses and invoices | Screenshots and [invoice module](https://app.deedit-business.evolluto.com/chunk-Bkwd9Y_g.js) show period-based summaries and individual invoices, direction/counterparty filters and conditional document links. Availability and completeness depend on account/source. |
| Comparisons and profitability | Screenshots and [comparison](https://app.deedit-business.evolluto.com/chunk-CoMzC5h6.js), [classification](https://app.deedit-business.evolluto.com/chunk-C8ws_85a.js) and [profitability](https://app.deedit-business.evolluto.com/chunk-DJ9-ytxo.js) modules show prior-year comparisons, breakdown and projection logic; calculations carry limitations. |
| VAT | Screenshots and [VAT module](https://app.deedit-business.evolluto.com/chunk-Ct_E5P75.js) show period-aware status/balance presentation. UI code is not verification of declared, payable, or complete values. |
| Tax and KEAO | [Obligations module](https://app.deedit-business.evolluto.com/chunk-BtQGTxuH.js) includes debt and arrangement details, installment date/amount and payment identity. Overlapping datasets cannot be assumed additive. |
| Employer contributions | Same module has distinct common employer and construction IKA/TEKA views, subject to the client identifier gates above. Does not establish how each official portal authenticates. |
| Individual contributions | Separate EFKA non-employee UI and client refresh gated to sole proprietorship with AMKA. Corporate employers and individuals must not be treated interchangeably. |
| Calendar and refresh | Owner screenshots show calendar and filters; [refresh module](https://app.deedit-business.evolluto.com/chunk-Drke9CyL.js) supports a combined refresh. Screenshots and public code do not establish automatic scheduled refresh, notifications or complete coverage. |

## Official routes and unresolved questions

The inspected business client delegates to its own vendor API; the cached modules do not establish DEEDIT's actual official AADE/EFKA/TEKA upstream URLs or whether its backend uses HTTP, browser automation or an intermediary. Prior authorized investigation recorded official entry points including [AADE VAT](https://www.aade.gr/diloseis-fpa-vies), [EFKA employer financial card](https://services.e-efka.gov.gr/ssp.efka.emp-transactions-ext/) and [KEAO debtor platform](https://services.e-efka.gov.gr/ssp.efka.keao/views/eDebtorCM/mainCM.xhtml); these are **our prior observations**, not evidence that DEEDIT uses them. The employer financial-card and DEEDIT APD data should remain separate until account-authorized source and field comparisons demonstrate equivalence.

Still unknown: official APD/TEKA upstream route(s), employer versus Taxisnet authentication requirements at those routes, complete response schemas and pagination, account/role/subscription coverage, actual creditor amounts and freshness, encryption algorithm and key management, privacy/retention terms, and marketing/FAQ claims. No private or vendor endpoint was called to resolve them. A later public-site review and appropriately authorized account-specific comparison would be needed to resolve these gaps.
