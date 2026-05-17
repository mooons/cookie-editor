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

## API

- `GET /health`
- `PUT /v1/cookie-sets/{domain}`
- `GET /v1/cookie-sets/{domain}`
- `DELETE /v1/cookie-sets/{domain}`

All `/v1/cookie-sets/*` endpoints require:

```http
Authorization: Bearer <COOKIE_SYNC_BEARER_TOKEN>
```
