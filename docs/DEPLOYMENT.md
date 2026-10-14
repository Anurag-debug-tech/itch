# Deployment: persistent Node host

Deploy this version as a **single Node.js 24 process** on a VM or container host with a persistent volume. SQLite and private uploaded evidence must survive process restarts and releases. Do not deploy this adapter to a stateless serverless filesystem, ephemeral preview deployment, or multiple independent instances.

## Build and start

```sh
npm ci
npm run setup
npm run db:migrate
npm run db:seed
npm run build
npm start
```

Set the configuration for the host before migration or startup:

```dotenv
DEMO_MODE=true
DATABASE_PATH=/persistent/milestoneguard/milestoneguard.sqlite
UPLOAD_DIR=/persistent/milestoneguard/uploads
APP_ORIGIN=https://your-demo-host.example
SESSION_SECRET=replace-with-a-cryptographically-random-secret
JOBS_TOKEN=replace-with-a-different-cryptographically-random-secret
```

The example values are placeholders. `npm run setup` generates random secrets locally; do not copy them into source code, logs, screenshots, or the browser bundle. Restrict the configuration file and volume to the application account. Terminate HTTPS through a reverse proxy and set the origin to the exact public URL. Current opaque sessions are cryptographically random and stored by hash; `SESSION_SECRET` is reserved for a future signed-session adapter and is not their security mechanism.

This release deliberately requires `DEMO_MODE=true` for the local adapter. Disabling it refuses local database operations rather than silently reverting to demo access. Therefore any hosted instance of this version remains a demo. Do not invite real-money transactions or sensitive client documents.

## Background processing

Run `npm run jobs:watch` as a separately supervised worker to process jobs every 60 seconds. Alternatively, schedule `npm run jobs` every 15 minutes under the same application user, working directory, and environment as the web server. For example, a host scheduler can invoke:

```sh
cd /srv/milestoneguard && npm run jobs
```

The application provides manual administrator processing and time advancement for demonstrations. Jobs create reminders and escalation evidence, not automatic payment authority. Protect any HTTP jobs endpoint with the configured server-side jobs token.

## Backups and operations

- Keep the database and upload directory on the same retained volume or coordinate their backups.
- Use SQLite's online backup mechanism or stop the application for a consistent database copy. Copying only the main `.sqlite` file while WAL writes are active is insufficient.
- Test restoring both records and referenced evidence into a separate environment.
- Preserve the `migrations` directory in deployment artifacts; the runtime reads migrations from the application working directory.
- Use process supervision, health monitoring, centralized restricted logs, and disk-space alerts.
- Do not run destructive demo reset against an environment whose records you need to retain.

## Moving beyond the demo

Implement and test hosted relational storage, private object storage, provider authentication, row-level or equivalent authorization, production job scheduling, distributed abuse controls, and migration/backup tooling. Live payments require a contracted provider that explicitly supports the intended arrangement, verified webhooks, reconciliation, legal review, and end-to-end testing. An API key alone does not provide those capabilities.

Optional AI credentials enable assistance only. Do not send private evidence to an external provider without an appropriate data-handling policy. Rule-based operation remains available when external AI is not configured.
