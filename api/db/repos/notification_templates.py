from __future__ import annotations
import json
import re
from datetime import datetime, timezone
from api.db.repos.base import BaseRepository


def _extract_variables(*templates: str | None) -> list[str]:
    """Extract {{var}} placeholders from template strings."""
    found: set[str] = set()
    for t in templates:
        if t:
            found.update(re.findall(r"\{\{(\w+)\}\}", t))
    return sorted(found)


class NotificationTemplateRepository(BaseRepository):
    def get_all(self) -> list[dict]:
        rows = self.execute("SELECT * FROM notification_templates ORDER BY id")
        return [dict(r) for r in rows]

    def get_by_id(self, template_id: int) -> dict | None:
        row = self.execute_one(
            "SELECT * FROM notification_templates WHERE id = ?", (template_id,)
        )
        return dict(row) if row else None

    def create(
        self,
        name: str,
        title_template: str,
        body_template: str,
        url_template: str | None,
        icon: str | None,
        created_by: int,
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        variables = json.dumps(
            _extract_variables(title_template, body_template, url_template)
        )
        return self.mutate(
            """INSERT INTO notification_templates
               (name, title_template, body_template, icon, url_template, variables, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, title_template, body_template, icon, url_template, variables, created_by, now, now),
        )

    def update(self, template_id: int, **fields) -> None:
        now = datetime.now(timezone.utc).isoformat()
        current = self.get_by_id(template_id)
        if not current:
            return
        name = fields.get("name", current["name"])
        title_t = fields.get("title_template", current["title_template"])
        body_t = fields.get("body_template", current["body_template"])
        url_t = fields.get("url_template", current["url_template"])
        icon = fields.get("icon", current["icon"])
        variables = json.dumps(_extract_variables(title_t, body_t, url_t))
        self.mutate(
            """UPDATE notification_templates
               SET name=?, title_template=?, body_template=?, url_template=?, icon=?, variables=?, updated_at=?
               WHERE id=?""",
            (name, title_t, body_t, url_t, icon, variables, now, template_id),
        )

    def delete(self, template_id: int) -> None:
        self.mutate("DELETE FROM notification_templates WHERE id = ?", (template_id,))
