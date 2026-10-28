from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import require_admin_user
from ...ai import _get_missing_llm_key_error
from ...config import get_config
from ...database import get_db
from ...runtime_settings import (
    RUNTIME_SETTING_KEYS,
    encrypt_setting_value,
    get_runtime_setting_rows,
    load_runtime_settings_cache,
)

router = APIRouter(prefix="/admin", tags=["admin"])


SETTING_METADATA = {
    "ASSEMBLY_AI_API_KEY": {
        "label": "AssemblyAI API key",
        "description": "Used for video transcription.",
        "input_type": "password",
    },
    "LLM": {
        "label": "LLM model",
        "description": "Provider and model, for example openai:gpt-5.2.",
        "input_type": "text",
    },
    "OPENAI_API_KEY": {
        "label": "OpenAI API key",
        "description": "Required for openai:* models.",
        "input_type": "password",
    },
    "OPENROUTER_API_KEY": {
        "label": "OpenRouter API key",
        "description": "Required for openrouter:* models, including Sonnet with Luna fallback.",
        "input_type": "password",
    },
    "GOOGLE_API_KEY": {
        "label": "Google API key",
        "description": "Required for google-gla:* models and fallback YouTube metadata.",
        "input_type": "password",
    },
    "ANTHROPIC_API_KEY": {
        "label": "Anthropic API key",
        "description": "Required for anthropic:* models.",
        "input_type": "password",
    },
    "OLLAMA_BASE_URL": {
        "label": "Ollama base URL",
        "description": "Optional URL for local or hosted Ollama-compatible endpoints.",
        "input_type": "text",
    },
    "OLLAMA_API_KEY": {
        "label": "Ollama API key",
        "description": "Optional, used by hosted Ollama-compatible providers.",
        "input_type": "password",
    },
    "YOUTUBE_DATA_API_KEY": {
        "label": "YouTube Data API key",
        "description": "Optional metadata provider key.",
        "input_type": "password",
    },
    "APIFY_API_TOKEN": {
        "label": "Apify API token",
        "description": "Optional YouTube download fallback provider token.",
        "input_type": "password",
    },
    "PEXELS_API_KEY": {
        "label": "Pexels API key",
        "description": "Optional B-roll stock footage provider key.",
        "input_type": "password",
    },
    "RERANK_LLM": {
        "label": "Rerank LLM model",
        "description": "Optional separate model for candidate reranking.",
        "input_type": "text",
    },
    "TRANSCRIPTION_PROVIDER": {
        "label": "Transcription provider",
        "description": "Audio transcription engine: 'whisper' (local) or 'assemblyai' (cloud).",
        "input_type": "text",
    },
    "WHISPER_MODEL_SIZE": {
        "label": "Whisper model size",
        "description": "Model size for Whisper: 'base', 'small', 'tiny', 'medium'.",
        "input_type": "text",
    },
    "MIN_CLIP_DURATION": {
        "label": "Minimum clip duration (seconds)",
        "description": "Minimum duration for any clip candidate in seconds (e.g. 60).",
        "input_type": "number",
    },
    "MAX_CLIP_DURATION": {
        "label": "Maximum clip duration (seconds)",
        "description": "Maximum duration for any clip candidate in seconds (e.g. 90).",
        "input_type": "number",
    },
    "IDEAL_CLIP_MIN_DURATION": {
        "label": "Ideal minimum clip duration (seconds)",
        "description": "Target lower duration in seconds for preferred clips (e.g. 60).",
        "input_type": "number",
    },
    "IDEAL_CLIP_MAX_DURATION": {
        "label": "Ideal maximum clip duration (seconds)",
        "description": "Target upper duration in seconds for preferred clips (e.g. 90).",
        "input_type": "number",
    },
    "CLIP_DURATION": {
        "label": "Target clip duration (seconds)",
        "description": "Default target clip duration in seconds (e.g. 60).",
        "input_type": "number",
    },
    "MAX_CLIPS": {
        "label": "Max clips per video",
        "description": "Upper cap on the number of clips generated per source video (e.g. 10).",
        "input_type": "number",
    },
    "ANALYSIS_TOTAL_TIMEOUT_SECONDS": {
        "label": "Analysis total timeout (seconds)",
        "description": "Total wall-clock timeout in seconds for transcript window analysis (e.g. 7200).",
        "input_type": "number",
    },
    "TRANSCRIPTION_LANGUAGE": {
        "label": "Default transcription language",
        "description": "Spoken language code for transcription (e.g. 'pt', 'en', 'es', or empty for auto-detect).",
        "input_type": "text",
    },
    "DEFAULT_GENERATION_CONTEXT": {
        "label": "Default generation context",
        "description": "Default creative guidance / prompt focus passed to the AI model for clip selection.",
        "input_type": "text",
    },
    "MCP_GEMINI_ENABLED": {
        "label": "Habilitar Gemini Pro via MCP",
        "description": "Ativa o conector MCP da conta Google Gemini Pro.",
        "input_type": "text",
    },
    "MCP_GEMINI_AUTH_MODE": {
        "label": "Modo de autenticação MCP Gemini Pro",
        "description": "Modo de conexão: 'session_cookie', 'oauth_token' ou 'external_mcp'.",
        "input_type": "text",
    },
    "MCP_GEMINI_SESSION_PSID": {
        "label": "Cookie __Secure-1PSID (Gemini Pro)",
        "description": "Cookie de sessão da conta Google Gemini Pro (gemini.google.com).",
        "input_type": "password",
    },
    "MCP_GEMINI_SESSION_PSIDTS": {
        "label": "Cookie __Secure-1PSIDTS (Gemini Pro)",
        "description": "Cookie complementar de sessão da conta Google Gemini Pro.",
        "input_type": "password",
    },
    "MCP_GEMINI_OAUTH_TOKEN": {
        "label": "Token OAuth / Bearer (Gemini Pro / CLI)",
        "description": "Token OAuth2 (ya29...) ou chave Bearer da conta Google AI Pro.",
        "input_type": "password",
    },
    "MCP_EXTERNAL_SERVER_URL": {
        "label": "URL do Servidor MCP Externo",
        "description": "Endpoint HTTP/SSE de um servidor MCP externo para Gemini Pro / Flow.",
        "input_type": "text",
    },
    "MCP_EXTERNAL_AUTH_TOKEN": {
        "label": "Token do Servidor MCP Externo",
        "description": "Token Bearer opcional para autenticar no servidor MCP externo.",
        "input_type": "password",
    },
    "MCP_FLOW_ENABLED": {
        "label": "Habilitar Google Flow via MCP",
        "description": "Ativa a geração de mídia (Imagen / Veo) via Google Labs Flow.",
        "input_type": "text",
    },
    "MCP_FLOW_AUTH_TOKEN": {
        "label": "Token de Sessão Google Flow (labs.google)",
        "description": "Bearer token ou cookie de sessão do Google Labs Flow (labs.google/fx/tools/flow).",
        "input_type": "password",
    },
    "MCP_FLOW_PROJECT_ID": {
        "label": "Project ID do Google Flow",
        "description": "ID opcional do projeto no Google Labs Flow.",
        "input_type": "text",
    },
}


class RuntimeSettingsUpdate(BaseModel):
    updates: dict[str, str] = Field(default_factory=dict)
    delete_keys: list[str] = Field(default_factory=list)
    prefer_admin_values: dict[str, bool] = Field(default_factory=dict)


def _setting_status(
    setting_key: str, rows: dict[str, dict[str, object]]
):
    env_value = get_config()._get_optional_env(setting_key)
    has_env = bool(env_value)
    row = rows.get(setting_key, {})
    has_admin_value = bool(row.get("encrypted_value"))
    prefer_admin_value = bool(row.get("prefer_admin_value"))
    metadata = SETTING_METADATA[setting_key]

    if has_admin_value and (prefer_admin_value or not has_env):
        source = "admin"
    elif has_env:
        source = "environment"
    else:
        source = "unset"

    # Expose the effective value for non-secret settings so the UI can show
    # what is actually in use (secrets are never echoed back).
    value = None
    if metadata["input_type"] != "password":
        value = get_config()._get_runtime_setting(setting_key) or ""

    return {
        "key": setting_key,
        "label": metadata["label"],
        "description": metadata["description"],
        "input_type": metadata["input_type"],
        "value": value,
        "source": source,
        "configured": has_env or has_admin_value,
        "has_admin_value": has_admin_value,
        "has_env_value": has_env,
        "prefer_admin_value": prefer_admin_value,
        "overridden_by_env": has_env and has_admin_value and not prefer_admin_value,
        "updated_at": row.get("updated_at"),
    }


@router.get("/health")
async def admin_health(
    request: Request, db: AsyncSession = Depends(get_db)
):
    await require_admin_user(request, db, get_config())
    return {"status": "ok"}


@router.get("/runtime-settings")
async def get_runtime_settings(request: Request, db: AsyncSession = Depends(get_db)):
    await require_admin_user(request, db, get_config())
    await load_runtime_settings_cache(db)
    rows = await get_runtime_setting_rows(db)
    return {
        "settings": [
            _setting_status(setting_key, rows) for setting_key in RUNTIME_SETTING_KEYS
        ]
    }


@router.patch("/runtime-settings")
async def update_runtime_settings(
    request: Request,
    payload: RuntimeSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    user_id = await require_admin_user(request, db, get_config())
    allowed_keys = set(RUNTIME_SETTING_KEYS)
    invalid_keys = [
        key
        for key in [
            *payload.updates.keys(),
            *payload.delete_keys,
            *payload.prefer_admin_values.keys(),
        ]
        if key not in allowed_keys
    ]
    if invalid_keys:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported setting key(s): {', '.join(sorted(set(invalid_keys)))}",
        )

    if "LLM" in payload.updates:
        config_error = _get_missing_llm_key_error(
            payload.updates["LLM"].strip(), get_config()
        )
        if (
            config_error
            and "API_KEY is not set" not in config_error
            and "no MCP credentials" not in config_error
        ):
            raise HTTPException(status_code=400, detail=config_error)

    clear_keys: list[str] = []
    for setting_key, raw_value in payload.updates.items():
        value = raw_value.strip()
        if not value:
            # An explicitly emptied value (e.g. "auto" language or a cleared
            # context) removes the admin override instead of being ignored.
            clear_keys.append(setting_key)
            continue
        encrypted_value = encrypt_setting_value(value)
        await db.execute(
            text(
                """
                INSERT INTO app_settings (setting_key, encrypted_value, updated_by)
                VALUES (:setting_key, :encrypted_value, :updated_by)
                ON CONFLICT (setting_key) DO UPDATE
                SET encrypted_value = EXCLUDED.encrypted_value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                """
            ),
            {
                "setting_key": setting_key,
                "encrypted_value": encrypted_value,
                "updated_by": user_id,
            },
        )

    for setting_key, prefer_admin_value in payload.prefer_admin_values.items():
        await db.execute(
            text(
                """
                UPDATE app_settings
                SET prefer_admin_value = :prefer_admin_value,
                    updated_by = :updated_by,
                    updated_at = CURRENT_TIMESTAMP
                WHERE setting_key = :setting_key
                """
            ),
            {
                "setting_key": setting_key,
                "prefer_admin_value": prefer_admin_value,
                "updated_by": user_id,
            },
        )

    keys_to_delete = sorted({*payload.delete_keys, *clear_keys})
    if keys_to_delete:
        await db.execute(
            text(
                """
                DELETE FROM app_settings
                WHERE setting_key = ANY(CAST(:setting_keys AS text[]))
                """
            ),
            {"setting_keys": keys_to_delete},
        )

    await db.commit()
    await load_runtime_settings_cache(db)

    rows = await get_runtime_setting_rows(db)
    return {
        "settings": [
            _setting_status(setting_key, rows) for setting_key in RUNTIME_SETTING_KEYS
        ]
    }
