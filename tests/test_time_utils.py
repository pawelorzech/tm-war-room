from datetime import datetime, timedelta, timezone

from api.time_utils import week_start_tct, week_end_tct, format_week_label


def _utc(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


def test_monday_before_anchor_rolls_to_previous_week():
    # Mon 17:59 TCT → previous Monday 18:00 TCT
    dt = _utc(2026, 4, 13, 17, 59)
    ts = week_start_tct(dt)
    result = datetime.fromtimestamp(ts, tz=timezone.utc)
    assert result == _utc(2026, 4, 6, 18, 0)


def test_monday_at_anchor_starts_current_week():
    dt = _utc(2026, 4, 13, 18, 0)
    ts = week_start_tct(dt)
    result = datetime.fromtimestamp(ts, tz=timezone.utc)
    assert result == _utc(2026, 4, 13, 18, 0)


def test_midweek_stays_in_current_week():
    dt = _utc(2026, 4, 15, 12, 0)  # Wednesday
    ts = week_start_tct(dt)
    result = datetime.fromtimestamp(ts, tz=timezone.utc)
    assert result == _utc(2026, 4, 13, 18, 0)


def test_sunday_stays_in_current_week():
    dt = _utc(2026, 4, 19, 23, 59)  # Sunday late
    ts = week_start_tct(dt)
    result = datetime.fromtimestamp(ts, tz=timezone.utc)
    assert result == _utc(2026, 4, 13, 18, 0)


def test_week_end_is_exactly_7_days_later():
    start = week_start_tct(_utc(2026, 4, 15, 10))
    end = week_end_tct(start)
    assert end - start == 7 * 86400


def test_naive_datetime_treated_as_utc():
    naive = datetime(2026, 4, 15, 10)  # no tz
    aware = _utc(2026, 4, 15, 10)
    assert week_start_tct(naive) == week_start_tct(aware)


def test_now_default_returns_valid_monday_anchor():
    ts = week_start_tct()
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    assert dt.weekday() == 0  # Monday
    assert dt.hour == 18
    assert dt.minute == 0


def test_format_week_label_includes_iso_week():
    ts = int(_utc(2026, 4, 13, 18, 0).timestamp())
    label = format_week_label(ts)
    assert "2026-W16" in label
    assert "Apr 13" in label
