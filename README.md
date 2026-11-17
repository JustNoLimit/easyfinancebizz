# EasyFinance

Greek-language business finance dashboard with a read-only AADE/myDATA connector and account login required before entering the application.

## Development

Node.js 24 recommended.

```sh
npm ci
npm start
npm run check
npm test
```

Default server: port 3000. Development vault: `/tmp/easyfinance-data`. `DATA_DIR`, `PORT` and `PUBLIC_ORIGIN` override these defaults. Production requires `NODE_ENV=production`, the HTTPS `PUBLIC_ORIGIN` and a persistent protected `DATA_DIR`.

## Features

- Year/half-year/quarter/month filters, charts, search and CSV export.
- Login-first home page; no sample dataset or public settings screen. Old local demo rows are ignored.
- Owner login and protected myDATA settings; encrypted persistent credentials/snapshot.
- AADE production/sandbox read-only income/expense synchronization with pagination.
- Actual API VAT values; grouped book rows, not individual invoices or payable tax debts.
- Light/dark appearance and mobile layouts.

Official registry, detailed VAT book fields and assisted myAADE/KEAO/EFKA portal connections are documented in [portal setup and limits](deploy/PORTALS.md). Account-specific debt/return completeness still requires the owner’s real login and validation.

See [myDATA setup and limitations](deploy/MYDATA.md) for owner activation and credential entry, [hosting operations](deploy/README.md) for the VPS layout, and [design references](deploy/DESIGN.md).

Ordinary Taxisnet credentials can be entered on the protected website for background collection. An optional encrypted browser envelope remembers the connection; the app does not persist the raw password in its server state. Tax debt, business, VAT-return and KEAO/EFKA collectors require real-account validation before claiming complete coverage; see the portal documentation. Official tax calculations and employer APD/TEKA coverage remain unverified.
