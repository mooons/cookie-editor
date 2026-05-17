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

Use Docker Compose when another reverse proxy will handle public HTTPS:

```sh
cp .env.example .env
$EDITOR .env
docker compose up -d
```

Important `.env` values for Compose:

- `COOKIE_SYNC_BEARER_TOKEN`: long random token used by the extension.
- `COOKIE_SYNC_BIND`: host address Caddy binds to. Keep `127.0.0.1` when
  another reverse proxy runs on the same host.
- `COOKIE_SYNC_PORT`: host port Caddy exposes over plain HTTP.
- `COOKIE_SYNC_CORS_ORIGINS`: `*` is convenient for development; restrict it
  to extension origins when you have stable IDs.

The Compose setup keeps the Python app private on the Docker network. Caddy is
the only exposed service and publishes `${COOKIE_SYNC_BIND}:${COOKIE_SYNC_PORT}`
over plain HTTP. Put your public reverse proxy in front of that listener for
TLS. Cookie JSON files are stored in the `cookie-sync-data` Docker volume.

## API

- `GET /health`
- `PUT /v1/cookie-sets/{domain}`
- `GET /v1/cookie-sets/{domain}`
- `DELETE /v1/cookie-sets/{domain}`

All `/v1/cookie-sets/*` endpoints require:

```http
Authorization: Bearer <COOKIE_SYNC_BEARER_TOKEN>
```
