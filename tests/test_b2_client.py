import importlib
import types
from unittest.mock import MagicMock, patch


class TestIsConfigured:
    def test_is_configured_false_when_env_missing(self, monkeypatch):
        monkeypatch.delenv("B2_APPLICATION_KEY_ID", raising=False)
        monkeypatch.delenv("B2_APPLICATION_KEY", raising=False)
        monkeypatch.delenv("B2_PUBLIC_URL", raising=False)
        monkeypatch.delenv("B2_BUCKET_NAME", raising=False)

        import api.b2_client as b2
        importlib.reload(b2)
        assert b2.is_configured() is False

    def test_is_configured_true_when_env_set(self, monkeypatch):
        monkeypatch.setenv("B2_APPLICATION_KEY_ID", "key-id-123")
        monkeypatch.setenv("B2_APPLICATION_KEY", "secret-key-abc")
        monkeypatch.setenv("B2_PUBLIC_URL", "https://cdn.example.com")
        monkeypatch.setenv("B2_BUCKET_NAME", "tmhubmedia")

        import api.b2_client as b2
        importlib.reload(b2)
        assert b2.is_configured() is True


class TestUploadBytes:
    def test_upload_bytes_returns_public_url(self, monkeypatch):
        monkeypatch.setenv("B2_APPLICATION_KEY_ID", "key-id-123")
        monkeypatch.setenv("B2_APPLICATION_KEY", "secret-key-abc")
        monkeypatch.setenv("B2_PUBLIC_URL", "https://cdn.example.com")
        monkeypatch.setenv("B2_BUCKET_NAME", "tmhubmedia")

        import api.b2_client as b2
        importlib.reload(b2)

        mock_bucket = MagicMock()
        mock_api = MagicMock()
        mock_api.get_bucket_by_name.return_value = mock_bucket

        with patch.object(b2, "_get_api", return_value=mock_api):
            result = b2.upload_bytes("avatars/123.jpg", b"img_data", "image/jpeg")

        mock_bucket.upload_bytes.assert_called_once_with(
            b"img_data", "avatars/123.jpg", content_type="image/jpeg"
        )
        assert result == "https://cdn.example.com/avatars/123.jpg"
