from __future__ import annotations
import json
import logging
from pywebpush import webpush, WebPushException

logger = logging.getLogger("tm-hub.push")


class PushService:
    def __init__(self, push_repo, notification_repo, vapid_private_key: str | None, vapid_claims: dict):
        self._push_repo = push_repo
        self._notif_repo = notification_repo
        self._vapid_key = vapid_private_key
        self._vapid_claims = vapid_claims

    def _store_notification_for_players(self, player_ids: list[int], event_type: str, title: str, body: str, url: str) -> None:
        if not self._notif_repo:
            return
        type_map = {"loot_level4": "loot", "war_start": "war", "stakeout_change": "stakeout", "oc_ready": "system", "chat_mention": "system"}
        seen: set[int] = set()
        for player_id in player_ids:
            if player_id in seen:
                continue
            seen.add(player_id)
            self._notif_repo.create(
                player_id=player_id,
                type=type_map.get(event_type, "system"),
                title=title,
                message=body,
                data={"event_type": event_type, "url": url},
            )

    @property
    def enabled(self) -> bool:
        return self._vapid_key is not None

    def dispatch(self, event_type: str, title: str, body: str, url: str) -> int:
        """Send push to ALL subscribers with this event preference. Returns count sent."""
        subs = self._push_repo.get_by_preference(event_type)
        self._store_notification_for_players([sub["player_id"] for sub in subs], event_type, title, body, url)

        if not self.enabled:
            return 0

        return self._send_to_subs(subs, title, body, url)

    def dispatch_to_player(self, player_id: int, event_type: str, title: str, body: str, url: str) -> int:
        """Send push to a specific player's subscriptions matching this event. Returns count sent."""
        self._store_notification_for_players([player_id], event_type, title, body, url)

        if not self.enabled:
            return 0

        subs = self._push_repo.get_by_player_and_preference(player_id, event_type)
        return self._send_to_subs(subs, title, body, url)

    def _send_to_subs(self, subs: list[dict], title: str, body: str, url: str) -> int:
        payload = json.dumps({"title": title, "body": body, "icon": "/favicon.ico", "url": url})
        sent = 0
        for sub in subs:
            try:
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                    },
                    data=payload,
                    vapid_private_key=self._vapid_key,
                    vapid_claims=self._vapid_claims,
                )
                sent += 1
            except WebPushException as e:
                if hasattr(e, 'response') and e.response is not None and e.response.status_code == 410:
                    logger.info("Removing expired push subscription: %s", sub["endpoint"][:50])
                    self._push_repo.delete_by_endpoint(sub["endpoint"])
                else:
                    logger.warning("Push failed for %s: %s", sub["endpoint"][:50], e)
            except Exception as e:
                logger.warning("Push error for %s: %s", sub["endpoint"][:50], e)
        return sent
