"""
FastAPI routes for MCP (Gemini Pro & Google Flow) status, testing, media generation,
and OpenAI-compatible internal bridge for PydanticAI.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...auth_headers import resolve_authenticated_user_id
from ...config import get_config
from ...database import get_db
from ...mcp_bridge import MCPBridgeClient, extract_json_object
from ...runtime_settings import load_runtime_settings_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp"])


class MCPTestRequest(BaseModel):
    target: str = Field(default="gemini", description="'gemini', 'flow', or 'both'")
    custom_prompt: Optional[str] = Field(default=None, max_length=1500)
    overrides: Dict[str, str] = Field(default_factory=dict)


class FlowImageRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1000)
    aspect_ratio: str = Field(default="IMAGE_ASPECT_RATIO_PORTRAIT")


@router.get("/status")
async def get_mcp_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return current MCP connection status for Gemini Pro and Google Flow."""
    await resolve_authenticated_user_id(request, db, get_config())
    await load_runtime_settings_cache(db)
    bridge = MCPBridgeClient(get_config())
    return bridge.get_status_summary()


@router.post("/test")
async def test_mcp_connection(
    request: Request,
    payload: MCPTestRequest,
    db: AsyncSession = Depends(get_db),
):
    """Test Gemini Pro and/or Google Flow MCP connectivity in real time."""
    await resolve_authenticated_user_id(request, db, get_config())
    await load_runtime_settings_cache(db)
    bridge = MCPBridgeClient(get_config(), overrides=payload.overrides)

    results: Dict[str, Any] = {}
    started = time.perf_counter()

    if payload.target in {"gemini", "both"}:
        try:
            prompt_to_send = (
                payload.custom_prompt.strip()
                if payload.custom_prompt and payload.custom_prompt.strip()
                else "Confirme em 1 frase curta em português que você está conectado ao SupoClip via MCP e pronto para gerar cortes virais."
            )
            reply = await bridge.complete_chat(
                prompt=prompt_to_send,
                model_id="gemini-pro",
            )
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            results["gemini"] = {
                "ok": True,
                "latency_ms": elapsed_ms,
                "auth_mode": bridge.auth_mode,
                "message": "Conta Gemini Pro conectada e respondendo via MCP!",
                "sample_reply": reply.strip()[:600],
            }
        except Exception as exc:
            results["gemini"] = {
                "ok": False,
                "auth_mode": bridge.auth_mode,
                "message": str(exc),
            }

    if payload.target in {"flow", "both"}:
        flow_started = time.perf_counter()
        try:
            img_res = await bridge.generate_flow_image("Neon studio background for viral podcast clip")
            elapsed_ms = round((time.perf_counter() - flow_started) * 1000)
            results["flow"] = {
                "ok": True,
                "latency_ms": elapsed_ms,
                "provider": img_res.get("provider"),
                "message": f"Google Flow operacional ({img_res.get('provider')})!",
            }
        except Exception as exc:
            results["flow"] = {
                "ok": False,
                "message": str(exc),
            }

    return {
        "ok": all(item.get("ok", False) for item in results.values()),
        "results": results,
        "status": bridge.get_status_summary(),
    }


@router.post("/flow/generate-image")
async def generate_flow_image_endpoint(
    request: Request,
    payload: FlowImageRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate a 9:16 background image using Google Flow via MCP for Thumbnail Studio."""
    await resolve_authenticated_user_id(request, db, get_config())
    await load_runtime_settings_cache(db)
    bridge = MCPBridgeClient(get_config())
    try:
        result = await bridge.generate_flow_image(
            prompt=payload.prompt,
            aspect_ratio=payload.aspect_ratio,
        )
        return result
    except Exception as exc:
        logger.warning("Failed to generate Flow image: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/v1/chat/completions")
async def mcp_openai_chat_completions(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """OpenAI-compatible /v1/chat/completions bridge for PydanticAI mcp:* models."""
    await load_runtime_settings_cache(db)
    body = await request.json()
    model_name = str(body.get("model") or "gemini-2.5-pro")
    messages: List[Dict[str, Any]] = body.get("messages") or []
    tools: List[Dict[str, Any]] = body.get("tools") or []

    system_parts: List[str] = []
    user_parts: List[str] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, list):
            text_piece = "\n".join(
                str(part.get("text", "")) for part in content if isinstance(part, dict)
            )
        else:
            text_piece = str(content or "")
        if not text_piece.strip():
            continue
        if role == "system":
            system_parts.append(text_piece)
        else:
            user_parts.append(text_piece)

    system_prompt = "\n\n".join(system_parts) if system_parts else None
    user_prompt = "\n\n".join(user_parts) if user_parts else "Hello"

    tool_name: Optional[str] = None
    json_schema: Optional[Dict[str, Any]] = None
    if tools:
        first_tool = tools[0].get("function") or {}
        tool_name = first_tool.get("name")
        json_schema = first_tool.get("parameters")

    bridge = MCPBridgeClient(get_config())
    try:
        raw_reply = await bridge.complete_chat(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model_id=model_name,
            json_schema=json_schema,
        )
    except Exception as exc:
        logger.error("MCP Bridge chat completion error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    completion_id = f"chatcmpl-mcp-{uuid.uuid4().hex[:12]}"
    created_ts = int(time.time())

    if tool_name:
        cleaned_json = extract_json_object(raw_reply)
        return {
            "id": completion_id,
            "object": "chat.completion",
            "created": created_ts,
            "model": model_name,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": f"call_{uuid.uuid4().hex[:8]}",
                                "type": "function",
                                "function": {
                                    "name": tool_name,
                                    "arguments": cleaned_json,
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created_ts,
        "model": model_name,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": raw_reply,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }

