"""Contract tests for Companion-touched API endpoints.

We don't run Pact here — the Companion ships one version to all users via
Greasy Fork, so the consumer/provider versioning model Pact assumes doesn't
fit. Instead we snapshot the backend's response shape into checked-in JSON
schemas and assert on every CI run that the live response still matches.

If a router author intentionally changes a response shape, they bump the
snapshot in the same PR — visible in code review. If a router author
accidentally changes a response shape, CI fails before the Companion does.

See `tests/test_companion_contracts.py` for the parametrized assertion
driver, and `tests/contracts/snapshots/*.json` for the checked-in schemas.

Schema dialect: a deliberately tiny subset of JSON Schema (Draft 2020-12).
We use ``"type"``, ``"properties"``, ``"required"``, ``"items"``,
``"additionalProperties"`` — and that's it. Optional fields stay out of
``required`` so transient absence (e.g. a feature flag short-circuit) does
not break the contract.

Source of truth for the endpoint list: ``extension/docs/perf-baseline.md``
section "Backend latency baseline".
"""
