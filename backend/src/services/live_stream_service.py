"""
Live Stream Service - Handles real-time capture and chunking of active live streams.
"""

import asyncio
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List, Callable, Awaitable
import yt_dlp

from ..config import get_config

logger = logging.getLogger(__name__)


class LiveStreamService:
    """Service to capture and segment active live streams into progressive chunks."""

    @staticmethod
    def extract_live_stream_url(youtube_url: str) -> Optional[str]:
        """
        Extract direct HLS / video stream URL for an active YouTube live stream.
        """
        ydl_opts = {
            "format": "best[height<=1080]/best",
            "quiet": True,
            "no_warnings": True,
            "nocheckcertificate": True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(youtube_url, download=False)
                if not info:
                    return None
                if info.get("url"):
                    return info["url"]
                formats = info.get("formats", [])
                for fmt in reversed(formats):
                    fmt_url = fmt.get("url", "")
                    if fmt_url and (
                        fmt.get("protocol") in ("m3u8_native", "m3u8", "https")
                        or ".m3u8" in fmt_url
                    ):
                        return fmt_url
                for fmt in reversed(formats):
                    if fmt.get("url"):
                        return fmt["url"]
        except Exception as exc:
            logger.error("Failed to extract live stream URL for %s: %s", youtube_url, exc)
        return None

    @staticmethod
    async def record_stream_chunk(
        stream_url: str,
        output_file: Path,
        duration_seconds: int = 600,
        should_cancel: Optional[Callable[[], Awaitable[bool]]] = None,
    ) -> bool:
        """
        Record a slice of duration_seconds from the live stream.
        Returns True if chunk was written successfully, False otherwise.
        """
        output_file.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            "ffmpeg",
            "-y",
            "-reconnect", "1",
            "-reconnect_at_eof", "1",
            "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            "-i", stream_url,
            "-t", str(duration_seconds),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-c:a", "aac",
            "-movflags", "+faststart",
            str(output_file),
        ]

        logger.info(
            "Starting live stream chunk recording to %s (duration %ss)",
            output_file.name,
            duration_seconds,
        )

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
        except Exception as exc:
            logger.error("Failed to launch ffmpeg for live chunk: %s", exc)
            return False

        poll_interval = 2.0
        elapsed = 0.0
        while process.returncode is None:
            if should_cancel and await should_cancel():
                logger.info("Cancellation requested while recording live chunk")
                try:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=5)
                except Exception:
                    process.kill()
                return False

            try:
                await asyncio.wait_for(process.wait(), timeout=poll_interval)
                break
            except asyncio.TimeoutError:
                elapsed += poll_interval
                # Safety margin: allow duration + 45s before aborting
                if elapsed >= duration_seconds + 45:
                    logger.warning("Chunk recording exceeded expected time, terminating ffmpeg")
                    try:
                        process.terminate()
                        await asyncio.wait_for(process.wait(), timeout=5)
                    except Exception:
                        process.kill()
                    break

        if output_file.exists() and output_file.stat().st_size > 100000:
            logger.info(
                "Live chunk successfully recorded: %s (%s KB)",
                output_file.name,
                output_file.stat().st_size // 1024,
            )
            return True

        logger.warning(
            "Live chunk %s empty or below threshold (%s bytes). Stream might have ended.",
            output_file.name,
            output_file.stat().st_size if output_file.exists() else 0,
        )
        return False
