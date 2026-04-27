# Force-load api.main once at collection time so every xdist worker — even
# the ones that only exercise tests under tests/test_admin.py or
# tests/test_routes.py — has it cached in sys.modules before any
# `patch("api.main.<attr>")` call runs. Without this, parallel workers race
# against import order and fail with
#   AttributeError: module 'api' has no attribute 'main'
# (lokalnie sequencyjnie nie boli, na CI z 4 vCPU + xdist boli za każdym razem).
import api.main  # noqa: F401

from tests.helpers import TEST_JWT_SECRET, auth_headers  # noqa: F401
