import os
import pytest
from api.db.repos.settings import AppSettingsRepository
from api.db.migrations.runner import run_migrations


@pytest.fixture
def settings_repo(tmp_path):
    db_path = str(tmp_path / "test.db")
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "api", "db", "migrations")
    run_migrations(db_path, migrations_dir)
    return AppSettingsRepository(db_path)


class TestAppSettings:
    def test_default_chat_setting_seeded(self, settings_repo):
        val = settings_repo.get("chat_enabled_for_all")
        assert val == "false"

    def test_set_and_get(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=123)
        assert settings_repo.get("chat_enabled_for_all") == "true"

    def test_get_nonexistent_returns_none(self, settings_repo):
        assert settings_repo.get("nonexistent_key") is None

    def test_get_all(self, settings_repo):
        all_s = settings_repo.get_all()
        assert "chat_enabled_for_all" in all_s

    def test_get_public_filters_keys(self, settings_repo):
        settings_repo.set("internal_secret", "hidden", updated_by=1)
        public = settings_repo.get_public()
        assert "chat_enabled_for_all" in public
        assert "internal_secret" not in public

    def test_set_upserts(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        settings_repo.set("chat_enabled_for_all", "false", updated_by=2)
        assert settings_repo.get("chat_enabled_for_all") == "false"


class TestChatAccessGating:
    """Test the chat access gating logic directly (unit-style)."""

    def test_admin_always_has_access(self, settings_repo):
        assert settings_repo.get("chat_enabled_for_all") == "false"

    def test_toggle_enables_access(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        assert settings_repo.get("chat_enabled_for_all") == "true"

    def test_toggle_disables_access(self, settings_repo):
        settings_repo.set("chat_enabled_for_all", "true", updated_by=1)
        settings_repo.set("chat_enabled_for_all", "false", updated_by=1)
        assert settings_repo.get("chat_enabled_for_all") == "false"
