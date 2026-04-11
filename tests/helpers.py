from api.auth import create_jwt

TEST_JWT_SECRET = "test-secret-shared"


def auth_headers(player_id: int = 123, name: str = "Test") -> dict[str, str]:
    return {
        "X-Player-Id": str(player_id),
        "Authorization": f"Bearer {create_jwt(player_id, name, TEST_JWT_SECRET, token_type='session')}",
    }
