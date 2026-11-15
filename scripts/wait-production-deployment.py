#!/usr/bin/env python3
"""Wait for the selected site's public deployment SHA before running UI checks.

Uses the Python standard library. Manual checks without an expected SHA proceed
directly to their browser checks; they do not claim to verify a particular build.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request


def wait_for_deployment(base_url: str, expected_sha: str, timeout: float = 180) -> dict | None:
    expected_sha = expected_sha.strip().lower()
    if not expected_sha:
        print("No expected SHA supplied; proceeding to direct site checks.", flush=True)
        return None
    if not re.fullmatch(r"[0-9a-f]{40}", expected_sha):
        raise ValueError("Expected deployment SHA must be a full 40-character commit SHA")
    if timeout <= 0:
        raise ValueError("Deployment wait timeout must be positive")
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("Deployment base URL must be an HTTP(S) URL without credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("Deployment base URL must not contain a query or fragment")

    endpoint = base_url.rstrip("/") + "/api/deployment"
    deadline = time.monotonic() + timeout
    last_status = "no response"
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"Expected deployment {expected_sha} did not become available: {last_status}")
        request = urllib.request.Request(endpoint, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
        try:
            with urllib.request.urlopen(request, timeout=min(10, remaining)) as response:
                data = json.load(response)
            actual_sha = data.get("commitSha") if isinstance(data, dict) else None
            if isinstance(actual_sha, str) and actual_sha.lower() == expected_sha:
                print(f"Verified selected site is serving commit {expected_sha}.", flush=True)
                return data
            last_status = f"serving {actual_sha or 'no commit SHA'}"
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            last_status = type(error).__name__
        print(f"Waiting for commit {expected_sha}: {last_status}", flush=True)
        time.sleep(min(5, max(0, deadline - time.monotonic())))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("PRODUCTION_BASE_URL", "https://asset360.intellic.co.kr"))
    parser.add_argument("--expected-sha", default=os.environ.get("EXPECTED_DEPLOYMENT_SHA", ""))
    parser.add_argument("--timeout", type=float, default=180)
    args = parser.parse_args()
    wait_for_deployment(args.base_url, args.expected_sha, args.timeout)


if __name__ == "__main__":
    main()
