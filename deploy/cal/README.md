# Private calendar deployment

This deployment uses the exact NUC image for Mitra 0.6.0-nuc.20261014.3, built from application commit `f718c7b3917336a50e1e6129676d99b39d8467ec`.

Image ID: `sha256:b40cb05a67810e8eb4aa14469267f299c2ac9360526844d08a873f77c88b7d20`.

The release's Docker archive contains application binaries and dependencies. Load it with `gzip -dc mitra-cal-20261014.3.tar.gz | docker load`, then tag that image ID as `mitra:cal-20261014.3`.

Copy `compose.yaml` to `/opt/mitra/compose.yaml`. Runtime data belongs in `/opt/mitra/data/`, outside the Git checkout. Transfer a consistent SQLite backup privately over SSH; integration tokens and passwords remain in that database and must never be committed or attached to a release. Stop the old Mitra instance before the final database snapshot and start only the VPS instance after copying it.

Nginx serves `https://cal.joaquingale.es` and protects the complete application, including APIs and assets, with HTTP Basic authentication. Docker listens only on `127.0.0.1:3004`. The owner sets the password interactively with `htpasswd -B /etc/nginx/.htpasswd-cal joaco`; the password file stays on the VPS, outside Git. Set its owner to `root:www-data` and mode to `640`.

Install `nginx.conf` as `/etc/nginx/sites-available/cal.joaquingale.es`, enable it under `sites-enabled`, and run `nginx -t` before reloading. Issue the TLS certificate first with Certbot's webroot at `/var/www/letsencrypt`; renewal uses the unauthenticated ACME challenge location on port 80. All other HTTP traffic redirects to HTTPS. Proxy buffering is disabled for calendar SSE updates.

The existing single-user Mitra identity is preserved. Enabling OIDC would create a separate empty account and is not part of this deployment. The Nginx password prompt supplies the private login without changing the application build or migrating ownership of records.

Validation: 1,459 application tests passed, along with typecheck, lint and production build. Browser mouse checks confirmed sequential and in-flight Todoist moves, resizing, reload and a later native sync. Deployment validation additionally checks image identity, SQLite integrity and table counts, Docker health, TLS, and unauthenticated 401 responses for the website and APIs.

After moving to the new hostname, open the site on each device and enable browser notifications there if desired; browser permissions are specific to each origin.
