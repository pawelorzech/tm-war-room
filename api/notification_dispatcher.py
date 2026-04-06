from __future__ import annotations
import logging
import re

logger = logging.getLogger("tm-hub.dispatcher")


def _resolve_template(template: str, variables: dict) -> str:
    """Replace {{var}} placeholders with values from variables dict."""
    def replacer(match):
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


class NotificationDispatcher:
    def __init__(self, push_service, push_repo, event_repo, group_repo, key_store):
        self._push_service = push_service
        self._push_repo = push_repo
        self._event_repo = event_repo
        self._group_repo = group_repo
        self._key_store = key_store

    def send(
        self,
        title: str,
        body: str,
        url: str | None = None,
        icon: str | None = None,
        target_type: str = "all",
        target_value: str | None = None,
        sent_by: str = "system",
        template_id: int | None = None,
        variables: dict | None = None,
    ) -> int:
        """Send notification. Returns event_id."""
        variables = variables or {}
        title = _resolve_template(title, variables)
        body = _resolve_template(body, variables)
        if url:
            url = _resolve_template(url, variables)

        event_id = self._event_repo.create_event(
            template_id=template_id, title=title, body=body,
            url=url, icon=icon, target_type=target_type,
            target_value=target_value, sent_by=sent_by,
            variables_used=variables,
        )

        subs = self._resolve_subscribers(target_type, target_value)
        player_count = len({s["player_id"] for s in subs})
        for sub in subs:
            pid = sub["player_id"]
            channel = sub.get("channel", "webpush")
            delivery_id = self._event_repo.create_delivery(event_id, pid, channel)

            if channel == "webpush":
                self._deliver_webpush(sub, title, body, url, delivery_id)
            # PDA deliveries stay pending — picked up by polling

        logger.info("Dispatched event %d (%s) to %d players", event_id, target_type, player_count)
        return event_id

    def _resolve_subscribers(self, target_type: str, target_value: str | None) -> list[dict]:
        """Return list of subscription dicts for the target."""
        if target_type == "player":
            return self._push_repo.get_by_player(int(target_value)) if target_value else []
        elif target_type == "all":
            return self._push_repo.get_all_subscribers()
        elif target_type == "group":
            player_ids = self._group_repo.get_player_ids(int(target_value)) if target_value else []
            subs = []
            for pid in player_ids:
                subs.extend(self._push_repo.get_by_player(pid))
            return subs
        elif target_type == "role":
            if target_value == "admin" and self._key_store:
                admins = self._key_store.get_admins()
            elif target_value == "member" and self._key_store:
                admins = self._key_store.get_all_keys()
            else:
                admins = []
            subs = []
            for a in admins:
                subs.extend(self._push_repo.get_by_player(a["player_id"]))
            return subs
        elif target_type == "preference":
            return self._push_repo.get_by_preference(target_value) if target_value else []
        return []

    def _deliver_webpush(self, sub: dict, title: str, body: str, url: str | None, delivery_id: int) -> None:
        if not self._push_service or not self._push_service.enabled:
            return
        try:
            self._push_service._send_to_subs([sub], title, body, url or "/notifications")
            self._event_repo.mark_delivered(delivery_id)
        except Exception as e:
            self._event_repo.mark_failed(delivery_id, str(e))
            logger.warning("WebPush delivery %d failed: %s", delivery_id, e)
