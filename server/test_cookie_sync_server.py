from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


def load_server(tmp_path: Path, token: str = "test-token"):
    os.environ["COOKIE_SYNC_BEARER_TOKEN"] = token
    os.environ["COOKIE_SYNC_STORAGE_DIR"] = str(tmp_path)
    os.environ["COOKIE_SYNC_CORS_ORIGINS"] = "*"

    module_path = Path(__file__).with_name("cookie_sync_server.py")
    module_name = "cookie_sync_server_under_test"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def auth_headers(token: str = "test-token") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def sample_payload(domain: str = "example.com") -> dict:
    return {
        "version": 1,
        "domain": domain,
        "updatedAt": "2026-05-17T00:00:00Z",
        "cookies": [
            {
                "name": "session",
                "value": "abc",
                "domain": ".example.com",
                "path": "/",
                "secure": True,
                "httpOnly": True,
            }
        ],
    }


def test_auth_required(tmp_path: Path):
    module = load_server(tmp_path)
    client = TestClient(module.app)

    response = client.get("/v1/cookie-sets/example.com")
    assert response.status_code == 401

    response = client.get(
        "/v1/cookie-sets/example.com",
        headers=auth_headers("wrong-token"),
    )
    assert response.status_code == 401


def test_put_replaces_single_domain_file(tmp_path: Path):
    module = load_server(tmp_path)
    client = TestClient(module.app)

    first = sample_payload()
    second = sample_payload()
    second["cookies"][0]["value"] = "replacement"

    response = client.put(
        "/v1/cookie-sets/example.com",
        json=first,
        headers=auth_headers(),
    )
    assert response.status_code == 200

    response = client.put(
        "/v1/cookie-sets/example.com",
        json=second,
        headers=auth_headers(),
    )
    assert response.status_code == 200

    files = sorted(tmp_path.iterdir())
    assert [path.name for path in files] == ["example.com.json"]
    assert ".tmp" not in files[0].name
    assert '"replacement"' in files[0].read_text()


def test_get_returns_stored_payload(tmp_path: Path):
    module = load_server(tmp_path)
    client = TestClient(module.app)
    payload = sample_payload()

    client.put(
        "/v1/cookie-sets/example.com",
        json=payload,
        headers=auth_headers(),
    )
    response = client.get(
        "/v1/cookie-sets/example.com",
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert response.json()["cookies"][0]["value"] == "abc"


def test_get_missing_domain_returns_404(tmp_path: Path):
    module = load_server(tmp_path)
    client = TestClient(module.app)

    response = client.get(
        "/v1/cookie-sets/missing.example",
        headers=auth_headers(),
    )
    assert response.status_code == 404


@pytest.mark.parametrize("domain", ["../x", "bad/domain", "bad..example"])
def test_invalid_domains_are_rejected(tmp_path: Path, domain: str):
    module = load_server(tmp_path)
    client = TestClient(module.app)

    response = client.put(
        f"/v1/cookie-sets/{domain}",
        json=sample_payload(domain),
        headers=auth_headers(),
    )
    assert response.status_code in {400, 404}


def test_delete_removes_domain_file(tmp_path: Path):
    module = load_server(tmp_path)
    client = TestClient(module.app)

    client.put(
        "/v1/cookie-sets/example.com",
        json=sample_payload(),
        headers=auth_headers(),
    )
    response = client.delete(
        "/v1/cookie-sets/example.com",
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert not (tmp_path / "example.com.json").exists()
