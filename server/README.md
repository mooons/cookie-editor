# Cookie Sync Server

Small backend for Cookie-Editor remote sync. It stores one JSON file per
normalized domain and replaces a domain's file in full on every push.

## Run

```sh
cp .env.example .env
$EDITOR .env
uv run cookie_sync_server.py
```

The extension should use the server URL and bearer token from `.env`.

For real remote use, put this behind HTTPS with a reverse proxy or managed host
TLS. Cookies can grant account access, and this server intentionally has only
single-user bearer-token protection.

## Run With Docker Compose

Point a DNS record at the remote host first, then set that hostname in `.env`:

```sh
cp .env.example .env
$EDITOR .env
docker compose up -d
```

Important `.env` values for Compose:

- `COOKIE_SYNC_DOMAIN`: public hostname for Caddy, for example
  `cookiesync.example.com`.
- `COOKIE_SYNC_BEARER_TOKEN`: long random token used by the extension.
- `COOKIE_SYNC_CORS_ORIGINS`: `*` is convenient for development; restrict it
  to extension origins when you have stable IDs.

The Compose setup keeps the Python app private on the Docker network. Caddy is
the only public service and listens on ports 80 and 443 for automatic HTTPS.
Cookie JSON files are stored in the `cookie-sync-data` Docker volume.

## API

- `GET /health`
- `PUT /v1/cookie-sets/{domain}`
- `GET /v1/cookie-sets/{domain}`
- `DELETE /v1/cookie-sets/{domain}`

All `/v1/cookie-sets/*` endpoints require:

```http
Authorization: Bearer <COOKIE_SYNC_BEARER_TOKEN>
```
