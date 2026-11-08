"""Compatibility import for scripts written before the Outpost rename.

Use outpost_client and OUTPOST_URL / OUTPOST_API_KEY for new scripts.
The old MAILPULSE_URL / MAILPULSE_API_KEY environment variables remain supported.
"""
from outpost_client import mark_failed, messages, stats, track

__all__ = ["track", "mark_failed", "stats", "messages"]
