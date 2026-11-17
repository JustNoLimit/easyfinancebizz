# DEEDIT Business / EasyFinance comparison

Inspected 17 November 2026. Basis: owner-provided screenshots, public DEEDIT Business client modules and current EasyFinance source. Public client code establishes UI/data-model capabilities, not independently verified backend correctness or availability on every account/subscription. No vendor credentials or private API requests were used. This comparison does not deploy or change the application.

| Capability | Reference evidence | EasyFinance state |
| --- | --- | --- |
| Income/expense summary, monthly chart, annual/half-year/quarter/month filters | Screenshots; dashboard/report modules | Implemented; production myDATA book and detailed VAT reads were verified previously |
| Individual invoices | `invoices` cursor API and invoice-item model with series/AA, type, issuer/counterparty, VAT, gross total; optional downloadingInvoiceUrl | Missing: myDATA book groups are not individual invoices; local demo entries do not close this gap |
| Invoice filters / document access | Issued/received direction, counterparty AFM, period, paged list, conditional document URL | Missing at individual-invoice level; existing summary search/CSV and portal PDFs are different capabilities |
| Prior-year comparison | Previous-year comparison report, annual data map and percentage changes | Missing automatic side-by-side report; selecting another year is not equivalent; book snapshot currently replaces the prior snapshot |
| Classified income/expense analysis | Separate ordinary and informational expense sections; descriptions, amounts and shares | Missing tax/accounting classification-based breakdown; demo category labels are not live accounting classifications |
| Profitability breakdown / projection | Cost of sales, payroll, rent, utilities, other expense slices; annual projection and prior-margin estimation code | Basic income minus expense only; no equivalent projection or breakdown; reference itself labels calculation limits |
| Period-aware VAT status | Current/previous balance, debit/credit indication; monthly/quarterly period based on tax category and exemption regime | Detailed myDATA VAT fields plus unvalidated portal collector; no equivalent reconciled period-aware payable/credit balance model |
| Structured tax debt / arrangements | Outside/inside arrangement lists, next installment date/amount, total-vs-installment view, debt identity copy, detail modal | Generic collected financial tables and supported fields; no equivalent normalized, reconciled debt/installment UI |
| Employer EFKA/APD / TEKA | Common employer IKA/TEKA, construction IKA/TEKA and AME/AMOE role-dependent views | Missing; current sources are AADE/business/VAT/KEAO/individual EFKA; employer coverage is not implemented |
| Detailed business profile | AMKA/AME/multiple AMOE editing, legal type, tax category, VAT regime and business end date | AFM and registry fields plus unvalidated business-page collection; no equivalent identifier/regime editing and connector eligibility rules |
| One refresh for all data | Header refresh calls VAT status, debts and myDATA income/expense + invoice synchronization | Taxisnet updates its sources together, but myDATA still has a separate sync action |
| Phone installation | Public PWA install prompt and iOS installation instructions | Responsive website; no app manifest/installable PWA workflow |
| Theme | Owner screenshot has light/dark/system | Light/dark implemented; automatic system-follow mode absent |
| Automatic Taxisnet collection | Encrypted browser-held credential envelope and separate vendor collection APIs | New background job workflow implemented and fixture-tested. Real-account auth, source navigation, schemas, pagination, balances and completeness still require validation. Not established feature parity |

## Sources

Public modules under https://app.deedit-business.evolluto.com/ :

- `chunk-CRcC6bCG.js`: credentials, invoice/summary/obligation services and state.
- `chunk-Bkwd9Y_g.js`: individual invoice UI, filters and document link.
- `chunk-CoMzC5h6.js`: previous-year comparison.
- `chunk-C8ws_85a.js`: ordinary/informational income/expense breakdown.
- `chunk-DJ9-ytxo.js`: profitability slices and projection.
- `chunk-Ct_E5P75.js`: VAT period and balance handling.
- `chunk-BtQGTxuH.js`: debts, arrangements, IDs, employer IKA/TEKA/construction UI.
- `chunk-DK2TJYyq.js`: identifiers, business profile and VAT regimes.
- `chunk-Drke9CyL.js` and `chunk-_SK2JUCq.js`: combined refresh and myDATA sync.
- `chunk-DjWmepm8.js`: PWA installation prompt.

Local implementation: `mydata.js`, `app.js`, `official-services.js`, `service-routes.js`, `taxisnet-routes.js`, `taxisnet.js`, `portal-worker/collect.js`, `index.html`.

## Practical order

1. Validate existing Taxisnet collection against the owner's actual account and reconcile returned debt/VAT values before treating it as production-complete.
2. Add individual myDATA invoices with pagination, direction/AFM filters and document links where officially provided.
3. Implement normalized debt/installment/payment-ID and VAT period/balance models with source-specific validation.
4. Add employer APD/TEKA and AMKA/AME/AMOE-based source eligibility where applicable to the business.
5. Add accounting classifications, multi-year retention/comparison and clearly labeled profitability projections.
6. Combine refresh actions; then add PWA/system theme convenience.

Do not infer other claimed features such as background schedules, push notifications, tax-return submission, invoice issuance or accountant multi-tenant management from generic shared strings alone; these have not been established for the inspected reference app.
