# Multi-application VPS layout

Deployed on 17 November 2026. Live demo: https://finance.107.175.212.3.sslip.io/. VPS public IP: 107.175.212.3; Tailscale IP: 100.110.28.67. Ubuntu 26.04, 1 vCPU, approximately 1 GB RAM, 20 GB disk. Cloud SSH must use the platform Tailscale TCP proxy; earlier direct connection failures did not establish a remote SSH problem. Application browser smoke tests passed against the live HTTPS site.

## Design

Use `/srv/hosting/edge` for one Caddy reverse proxy and `/srv/hosting/apps/<app>` for separate Compose projects. Only Caddy publishes HTTP/HTTPS ports. App services and future databases must not publish ports; give each a unique network alias. Use a separate internal network for each app's database, connected only to that app. Do not mount the Docker socket in apps. Docker port publishing can bypass UFW; enforce only 22, 80 and 443 inbound at the provider firewall as well as host rules. Preserve the confirmed SSH port.

The supplied limits are provisional until RAM, CPU and storage have been inspected. Containers use bounded logs, restart policies and named Caddy volumes. Never use `docker compose down -v` during routine updates: it deletes persistent data.

## Before remote installation

1. Inspect OS, RAM, disk, listening ports, firewall and existing workloads.
2. Docker Engine and Compose were installed from signed Ubuntu repositories (`docker.io`, `docker-compose-v2`). Use the supported signed packages for the detected OS. Docker is enabled on boot.
3. Create a named administrative user and a user-owned SSH key. Verify a second SSH session before changing access policy. Rotate the disclosed initial root password through the provider's secure console; never write passwords into setup scripts.
4. Enable security updates and configure firewall without interrupting SSH. Do not reboot blindly.
5. Copy this repository to `/srv/hosting/apps/easyfinance`, and copy `deploy/edge` to `/srv/hosting/edge`.

## Initial start (after Docker and access are verified)

The Caddy configuration starts on HTTP using the server IP. This is a public demonstration with sample data only.

```sh
cd /srv/hosting/edge
docker compose config --quiet
docker compose up -d
cd /srv/hosting/apps/easyfinance/deploy/easyfinance
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://107.175.212.3/
```

Check the app container health, Caddy logs and an external browser before reporting deployment complete.

## Temporary hostname and HTTPS

`finance.107.175.212.3.sslip.io` is an IP-based third-party DNS name: no account, registration or ownership is conferred. Check that it resolves to the VPS before use. Replace `http://107.175.212.3` in `/srv/hosting/edge/sites/easyfinance.caddy` with `finance.107.175.212.3.sslip.io`, then:

```sh
cd /srv/hosting/edge
docker compose exec -w /etc/caddy caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec -w /etc/caddy caddy caddy reload --config /etc/caddy/Caddyfile
curl --fail https://finance.107.175.212.3.sslip.io/
```

Certificate issuance depends on public DNS, open ports and CA limits. Never disable TLS verification to work around certificate problems. Changing origin changes browser localStorage: data entered under the IP will not appear under the HTTPS hostname.

## Add another site

Create its own Compose project with a unique project name and unique alias on the external `hosting-web` network; publish no app ports. Add `/srv/hosting/edge/sites/<site>.caddy` with its hostname and `reverse_proxy <unique-alias>:<port>`, validate and reload Caddy. Each application gets independent updates, limits and volumes. Trust only reviewed images/code on this host: containers share one kernel and are not strong isolation from hostile workloads.

## Operations

Back up Compose/Caddy configuration and named volumes to a separate system; test restoration. Demo records remain browser-local; real myDATA credentials and snapshots use the encrypted easyfinance_data server volume. Keep real records out until authentication, server-side persistence and backups are implemented. The public demonstration is separate from protected myDATA data; owner activation is required.

Update one Compose project at a time. Retain its previous image and configuration to roll back. Monitor disk, RAM and `docker compose logs --tail=100`; do not run blanket prune commands. Future private admin panels should be behind authentication or a VPN, not publicly exposed.


## Current operational state

- Live proxy directory: `/srv/hosting/edge`; site configuration: `sites/easyfinance.caddy` uses the HTTPS hostname above. The repository example starts with HTTP by IP for fresh installations.
- Application: `/srv/hosting/apps/easyfinance/deploy/easyfinance`. No direct app port is published. Containers restart unless stopped, have bounded logs and memory/CPU limits. App runs as `node` with a read-only filesystem and dropped capabilities.
- UFW enabled: 22/tcp, 80/tcp, 443/tcp+udp and Tailscale 41641/udp; inbound tailnet traffic allowed. Docker publishes only 80 and 443. Provider firewall settings were not inspected.
- Automatic APT updates and unattended upgrades enabled via `/etc/apt/apt.conf.d/52hosting-auto-upgrades`.
- Daily systemd timer: `hosting-backup.timer`, 03:23 UTC plus up to five minutes random delay. `/srv/hosting/bin/backup.sh` archives app sources, edge configuration and Caddy volume state to `/srv/hosting/backups` with seven-day retention and owner-only permissions. Manual and service-triggered backup runs succeeded. This is same-disk recovery only; off-host backup and a full restoration drill remain outstanding. Browser finance records are not included.
- Existing provider-installed newer kernel requires a planned reboot; no reboot has been performed.
- After explicit user approval, a root SSH public key was installed and key authentication was verified. The private key stays outside the project checkout in the protected cloud workspace. Password authentication remains unchanged. Rotate the password disclosed in chat via the provider console. Do not disable existing access before verifying replacement access.

### Checks and updates

```sh
cd /srv/hosting/apps/easyfinance/deploy/easyfinance
docker compose ps
docker compose logs --tail=50
# After copying reviewed source changes:
docker compose up -d --build
curl --fail https://finance.107.175.212.3.sslip.io/
systemctl status hosting-backup.timer --no-pager
systemctl start hosting-backup.service
```

Live deployment verified: trusted HTTPS requests return the correct app and JavaScript, the app container is healthy, and live browser tests pass (create/delete, persistence, search, filters, CSV, profile, dialog, appearance and mobile layout). The browser test needed the platform's installed proxy CA imported into a temporary test trust store; TLS verification remained enabled.


## myDATA rollout (17 November 2026)

The application now requires `easyfinance_data` as an external named volume for encrypted credentials/snapshots. The volume is initialized with UID/GID 1000 and mode 700 and included in the daily same-disk backup script. `PUBLIC_ORIGIN` is the exact HTTPS site origin. Preserve this volume on all updates. API access without login returns 401. Owner activation remains pending until the user enters the server-only setup token and chooses their application password. See [MYDATA.md](MYDATA.md).

Both pre-redesign and pre-myDATA source archives and image tags have been retained for rollback. Never roll back by deleting the data volume. The approved root SSH key was installed and tested; password authentication was not changed.
