# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "fastapi>=0.115",
#   "pydantic>=2.0",
#   "python-dotenv>=1.0",
#   "uvicorn[standard]>=0.30",
# ]
# ///

from __future__ import annotations

import hmac
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field


DOMAIN_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")


class Settings(BaseModel):
    bearer_token: str
    storage_dir: Path
    bind: str = "127.0.0.1"
    port: int = 8765
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])


class CookieSet(BaseModel):
    model_config = ConfigDict(extra="allow")

    version: int
    domain: str
    updatedAt: str
    cookies: list[dict[str, Any]] = Field(default_factory=list)


def load_settings() -> Settings:
    load_dotenv(Path(__file__).with_name(".env"))

    bearer_token = os.environ.get("COOKIE_SYNC_BEARER_TOKEN", "").strip()
    if not bearer_token:
        raise RuntimeError("COOKIE_SYNC_BEARER_TOKEN must be set")

    storage_dir = Path(
        os.environ.get("COOKIE_SYNC_STORAGE_DIR", "./cookie-sync-data")
    ).expanduser()
    bind = os.environ.get("COOKIE_SYNC_BIND", "127.0.0.1").strip()
    port = int(os.environ.get("COOKIE_SYNC_PORT", "8765"))
    cors_origins = [
        origin.strip()
        for origin in os.environ.get("COOKIE_SYNC_CORS_ORIGINS", "*").split(",")
        if origin.strip()
    ]

    return Settings(
        bearer_token=bearer_token,
        storage_dir=storage_dir,
        bind=bind,
        port=port,
        cors_origins=cors_origins or ["*"],
    )


settings = load_settings()
settings.storage_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Cookie Sync Server", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def normalize_domain(raw_domain: str) -> str:
    domain = raw_domain.strip().lower().rstrip(".")
    if (
        not domain
        or len(domain) > 253
        or "/" in domain
        or "\\" in domain
        or ".." in domain
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid domain",
        )

    if domain == "localhost":
        return domain

    labels = domain.split(".")
    if len(labels) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid domain",
        )
    for label in labels:
        if not DOMAIN_LABEL_RE.match(label):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid domain",
            )
    return domain


def require_bearer(authorization: str | None = Header(default=None)) -> None:
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len(prefix) :].strip()
    if not hmac.compare_digest(token, settings.bearer_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def storage_path_for_domain(domain: str) -> Path:
    normalized_domain = normalize_domain(domain)
    path = settings.storage_dir / f"{normalized_domain}.json"
    if path.parent != settings.storage_dir:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid domain",
        )
    return path


def fsync_directory(path: Path) -> None:
    if os.name == "nt":
        return
    dir_fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{path.stem}.",
        suffix=".tmp",
        dir=settings.storage_dir,
        text=True,
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as temp_file:
            json.dump(payload, temp_file, indent=2, sort_keys=True)
            temp_file.write("\n")
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_path, path)
        fsync_directory(settings.storage_dir)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.put("/v1/cookie-sets/{domain}", dependencies=[Depends(require_bearer)])
def put_cookie_set(domain: str, cookie_set: CookieSet) -> dict[str, Any]:
    normalized_domain = normalize_domain(domain)
    body_domain = normalize_domain(cookie_set.domain)
    if body_domain != normalized_domain:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Body domain does not match path domain",
        )
    if cookie_set.version != 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported cookie set version",
        )

    payload = cookie_set.model_dump(mode="json")
    payload["domain"] = normalized_domain
    path = storage_path_for_domain(normalized_domain)
    atomic_write_json(path, payload)
    return {
        "ok": True,
        "domain": normalized_domain,
        "cookieCount": len(cookie_set.cookies),
    }


@app.get("/v1/cookie-sets/{domain}", dependencies=[Depends(require_bearer)])
def get_cookie_set(domain: str) -> dict[str, Any]:
    path = storage_path_for_domain(domain)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cookie set not found",
        )
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stored cookie set is not valid JSON",
        ) from error


@app.delete("/v1/cookie-sets/{domain}", dependencies=[Depends(require_bearer)])
def delete_cookie_set(domain: str) -> dict[str, Any]:
    normalized_domain = normalize_domain(domain)
    path = storage_path_for_domain(normalized_domain)
    deleted = path.exists()
    path.unlink(missing_ok=True)
    return {"ok": True, "domain": normalized_domain, "deleted": deleted}


if __name__ == "__main__":
    import uvicorn

    print(
        "Cookie sync server listening on "
        f"http://{settings.bind}:{settings.port}"
    )
    print(f"Cookie sync storage directory: {settings.storage_dir.resolve()}")
    uvicorn.run(
        app,
        host=settings.bind,
        port=settings.port,
        reload=False,
    )
