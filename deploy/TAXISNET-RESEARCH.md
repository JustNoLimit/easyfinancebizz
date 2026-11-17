# Taxisnet connector findings — 2026-11-17

## Public evidence

Read-only inspection of public JavaScript at:

- https://app.deedit-business.evolluto.com/main-LF6PLKZO.js
- https://app.deedit-business.evolluto.com/chunk-CRcC6bCG.js
- https://app.deedit-business.evolluto.com/chunk-DK2TJYyq.js
- https://app.deedit-business.evolluto.com/chunk-Drke9CyL.js

The main bundle configures the vendor API base as `https://api.deedit-business.evolluto.com`. The following paths belong to that vendor API; they are not published AADE endpoints.

The ordinary Taxisnet credentials service POSTs a newly entered password to `credentials/encrypt-password`. It stores the returned encrypted password and the username in browser localStorage under an account-scoped `.aade` key. The public client does not reveal the encryption algorithm or server key management. Encryption happens via the vendor server, not wholly within browser JavaScript.

The client sends those credentials to its own backend for business details (`user-details/:id`), tax debts (`debts`), VAT status (`vat-info`), KEAO (`debts/keao`), employer contributions (`debts/efka-apd`) and eligible individual EFKA debts (`debts/efka`). Collection is followed by reading saved results. This supports a credentials-and-refresh interface without requiring the user to navigate a rendered remote desktop.

The client checks business profile fields before requesting some sources: AMKA/AME/AMOE for KEAO, AME/AMOE for employer contributions, AMKA plus individual business type for individual EFKA debts. These are eligibility checks, not proof that a particular taxpayer has no liability.

## What is not established

Public frontend code does not establish whether each backend connector uses HTTP sessions, browser automation or another upstream mechanism. It does not expose their backend implementation or grant permission to use their private API. No vendor login, encrypted-password request or taxpayer query was performed during this inspection.

There is no evidence here of a general public AADE API covering all personal liabilities with a myDATA Subscription Key. The current app’s special registry credentials and myDATA connector cannot substitute for ordinary Taxisnet access to those services.

## Required replacement

Replace the remote-browser-first experience with an owner-operated connector on our VPS: explicit ordinary Taxisnet credentials, an explicit remember choice with clear encryption/storage semantics, a background collection job, separate business/debt/VAT/KEAO/EFKA results, per-source status and source timestamps. Use a browser internally only where needed; request user interaction for real MFA or consent. Do not make remote page navigation or manual page capture the normal workflow.

Validate authentication, AFM identity, upstream schemas, pagination and totals using the owner’s authorized session before labeling a source complete. Preserve the prior successful result on failure, show unknown separately from zero, and keep myDATA synchronization independent. Do not claim parity on the basis of public login screens or synthetic tests.

No runtime changes or new credential retention were deployed as part of this research.
