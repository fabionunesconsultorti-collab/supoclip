"""
MCP Bridge Service for connecting Google Gemini Pro (Web Session / OAuth / External MCP)
and Google Labs Flow (Imagen / Veo) to SupoClip.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx

from .config import Config, get_config

logger = logging.getLogger(__name__)

GEMINI_WEB_APP_URL = "https://gemini.google.com/app"
GEMINI_WEB_STREAM_URL = (
    "https://gemini.google.com/_/BardChatUi/data/"
    "assistant.lamda.BardFrontendService/StreamGenerate"
)
GOOGLE_GENERATIVE_LANGUAGE_URL = "https://generativelanguage.googleapis.com/v1beta"
GOOGLE_FLOW_IMAGEFX_URL = "https://aisandbox-pa.googleapis.com/v1:runImageFx"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def resolve_mcp_bridge_base_url() -> str:
    """Return the internal OpenAI-compatible base URL for the MCP bridge."""
    port = os.getenv("PORT", "8000")
    host = os.getenv("MCP_BRIDGE_INTERNAL_HOST")
    if host:
        return f"http://{host.rstrip('/')}/mcp/v1"
    if os.path.exists("/.dockerenv"):
        return f"http://backend:{port}/mcp/v1"
    return f"http://127.0.0.1:{port}/mcp/v1"


def extract_json_object(raw_text: str) -> str:
    """Extract the first valid JSON object or array from a markdown/prose response."""
    cleaned = raw_text.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        candidate = fence_match.group(1).strip()
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            pass

    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace : last_brace + 1]
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            pass

    return cleaned


class MCPBridgeClient:
    """Unified connector for Gemini Pro account and Google Flow via MCP."""

    def __init__(self, config: Optional[Config] = None, overrides: Optional[Dict[str, str]] = None):
        self.config = config or get_config()
        self.overrides = overrides or {}
        self._snlm0e_cache: dict[str, tuple[float, str]] = {}

    def _setting(self, key: str, attr_name: str, default: str = "") -> str:
        if key in self.overrides and self.overrides[key] is not None:
            return str(self.overrides[key]).strip()
        val = getattr(self.config, attr_name, None)
        if val is None:
            return default
        if isinstance(val, bool):
            return "true" if val else "false"
        return str(val).strip()

    @property
    def gemini_enabled(self) -> bool:
        val = self._setting("MCP_GEMINI_ENABLED", "mcp_gemini_enabled", "true").lower()
        return val in {"1", "true", "yes", "on"}

    @property
    def auth_mode(self) -> str:
        mode = self._setting("MCP_GEMINI_AUTH_MODE", "mcp_gemini_auth_mode", "session_cookie").lower()
        if mode not in {"session_cookie", "oauth_token", "external_mcp"}:
            return "session_cookie"
        return mode

    @property
    def session_psid(self) -> str:
        return self._setting("MCP_GEMINI_SESSION_PSID", "mcp_gemini_session_psid", "")

    @property
    def session_psidts(self) -> str:
        return self._setting("MCP_GEMINI_SESSION_PSIDTS", "mcp_gemini_session_psidts", "")

    @property
    def oauth_token(self) -> str:
        return self._setting("MCP_GEMINI_OAUTH_TOKEN", "mcp_gemini_oauth_token", "")

    @property
    def external_server_url(self) -> str:
        return self._setting("MCP_EXTERNAL_SERVER_URL", "mcp_external_server_url", "")

    @property
    def external_auth_token(self) -> str:
        return self._setting("MCP_EXTERNAL_AUTH_TOKEN", "mcp_external_auth_token", "")

    @property
    def flow_enabled(self) -> bool:
        val = self._setting("MCP_FLOW_ENABLED", "mcp_flow_enabled", "true").lower()
        return val in {"1", "true", "yes", "on"}

    @property
    def flow_auth_token(self) -> str:
        return self._setting("MCP_FLOW_AUTH_TOKEN", "mcp_flow_auth_token", "")

    @property
    def flow_project_id(self) -> str:
        return self._setting("MCP_FLOW_PROJECT_ID", "mcp_flow_project_id", "")

    def is_gemini_configured(self) -> bool:
        if not self.gemini_enabled:
            return False
        mode = self.auth_mode
        if mode == "session_cookie":
            return bool(self.session_psid or self.oauth_token or self.config.google_api_key)
        if mode == "oauth_token":
            return bool(self.oauth_token or self.config.google_api_key)
        if mode == "external_mcp":
            return bool(self.external_server_url)
        return False

    def is_flow_configured(self) -> bool:
        if not self.flow_enabled:
            return False
        return bool(
            self.flow_auth_token
            or self.session_psid
            or self.external_server_url
            or self.oauth_token
            or self.config.google_api_key
        )

    def get_status_summary(self) -> Dict[str, Any]:
        """Return non-secret connection status and available MCP tools."""
        gemini_ready = self.is_gemini_configured()
        flow_ready = self.is_flow_configured()
        tools = [
            {
                "name": "gemini_pro_transcript_analysis",
                "title": "Análise de Cortes & Viralidade (Gemini Pro)",
                "provider": "gemini-pro",
                "ready": gemini_ready,
            },
            {
                "name": "gemini_pro_viral_titles",
                "title": "Sugestão de Títulos Virais (Gemini Pro)",
                "provider": "gemini-pro",
                "ready": gemini_ready,
            },
            {
                "name": "flow_generate_thumbnail_bg",
                "title": "Fundo de Thumbnail 9:16 com IA (Google Flow / Imagen)",
                "provider": "google-flow",
                "ready": flow_ready,
            },
            {
                "name": "flow_generate_broll_prompt",
                "title": "Direção Visual & Cenas B-Roll (Google Flow / Veo)",
                "provider": "google-flow",
                "ready": flow_ready,
            },
        ]
        return {
            "gemini": {
                "enabled": self.gemini_enabled,
                "configured": gemini_ready,
                "auth_mode": self.auth_mode,
                "has_session_psid": bool(self.session_psid),
                "has_session_psidts": bool(self.session_psidts),
                "has_oauth_token": bool(self.oauth_token),
                "has_external_url": bool(self.external_server_url),
                "external_server_url": self.external_server_url or "",
                "has_fallback_api_key": bool(self.config.google_api_key),
            },
            "flow": {
                "enabled": self.flow_enabled,
                "configured": flow_ready,
                "unified_with_gemini": bool(self.session_psid and not self.flow_auth_token),
                "has_flow_token": bool(self.flow_auth_token),
                "project_id": self.flow_project_id or "",
            },
            "active_llm": self.config.llm,
            "is_mcp_active_llm": self.config.llm.startswith("mcp:"),
            "tools": tools,
        }

    async def complete_chat(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model_id: str = "gemini-2.5-pro",
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Execute a completion using the configured Gemini Pro MCP mode."""
        full_prompt = prompt
        if system_prompt:
            full_prompt = f"SYSTEM INSTRUCTIONS:\n{system_prompt.strip()}\n\nUSER TASK:\n{prompt}"

        if json_schema:
            schema_str = json.dumps(json_schema, ensure_ascii=False)
            full_prompt += (
                "\n\nCRITICAL OUTPUT FORMAT REQUIREMENT:\n"
                "You MUST respond with ONLY a valid JSON object that strictly conforms "
                "to the following JSON Schema. Do NOT wrap in explanations or markdown prose:\n"
                f"{schema_str}"
            )

        mode = self.auth_mode
        errors: list[str] = []

        if mode == "session_cookie" and self.session_psid:
            try:
                return await self._complete_via_gemini_web_session(full_prompt)
            except Exception as exc:
                logger.warning("Gemini Pro web session call failed: %s", exc)
                errors.append(f"Sessão Web Gemini Pro: {exc}")

        if mode == "external_mcp" and self.external_server_url:
            try:
                return await self._complete_via_external_mcp(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model_id=model_id,
                    json_schema=json_schema,
                )
            except Exception as exc:
                logger.warning("External MCP server call failed: %s", exc)
                errors.append(f"Servidor MCP Externo: {exc}")

        if self.oauth_token:
            try:
                return await self._complete_via_google_token(
                    full_prompt, token=self.oauth_token, model_id=model_id, force_json=bool(json_schema)
                )
            except Exception as exc:
                logger.warning("Gemini OAuth/Bearer token call failed: %s", exc)
                errors.append(f"Token OAuth/Bearer: {exc}")

        if self.config.google_api_key:
            try:
                return await self._complete_via_google_token(
                    full_prompt,
                    token=self.config.google_api_key,
                    model_id=model_id,
                    force_json=bool(json_schema),
                    is_api_key=True,
                )
            except Exception as exc:
                logger.warning("Fallback GOOGLE_API_KEY call failed: %s", exc)
                errors.append(f"Google API Key: {exc}")

        detail = "; ".join(errors) if errors else "Nenhuma credencial MCP Gemini Pro configurada."
        raise RuntimeError(f"Falha na comunicação com Gemini Pro via MCP ({detail})")

    async def _get_gemini_web_snlm0e(self, client: httpx.AsyncClient, cookies: Dict[str, str]) -> str:
        cache_key = f"{cookies.get('__Secure-1PSID', '')}:{cookies.get('__Secure-1PSIDTS', '')}"
        now = time.time()
        cached = self._snlm0e_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1]

        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        }
        response = await client.get(GEMINI_WEB_APP_URL, headers=headers, cookies=cookies, follow_redirects=True)
        if response.status_code != 200:
            raise RuntimeError(f"HTTP {response.status_code} ao acessar gemini.google.com")

        match = re.search(r'"SNlM0e":"([^"]+)"', response.text)
        if not match:
            raise RuntimeError(
                "Não foi possível extrair o token de sessão SNlM0e. "
                "Verifique se os cookies __Secure-1PSID e __Secure-1PSIDTS estão atualizados."
            )
        token = match.group(1)
        self._snlm0e_cache[cache_key] = (now + 1800, token)
        return token

    async def _complete_via_gemini_web_session(self, prompt: str) -> str:
        cookies: Dict[str, str] = {}
        raw_psid = self.session_psid
        if "=" in raw_psid and ";" in raw_psid:
            for part in raw_psid.split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    cookies[k.strip()] = v.strip()
        else:
            cookies["__Secure-1PSID"] = raw_psid
            if self.session_psidts:
                cookies["__Secure-1PSIDTS"] = self.session_psidts

        async with httpx.AsyncClient(timeout=180.0) as client:
            at_token = await self._get_gemini_web_snlm0e(client, cookies)
            inner_req = json.dumps([[prompt], None, ["", "", ""]])
            f_req = json.dumps([None, inner_req])
            headers = {
                "User-Agent": DEFAULT_USER_AGENT,
                "Origin": "https://gemini.google.com",
                "Referer": "https://gemini.google.com/",
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Same-Domain": "1",
            }
            resp = await client.post(
                GEMINI_WEB_STREAM_URL,
                params={"bl": "boq_assistant-bard-web-server_20250219.08_p0", "_reqid": "100000", "rt": "c"},
                data={"f.req": f_req, "at": at_token},
                headers=headers,
                cookies=cookies,
            )
            if resp.status_code != 200:
                raise RuntimeError(f"Gemini Web StreamGenerate retornou HTTP {resp.status_code}")

            text_out = self._parse_bard_stream_response(resp.text)
            if not text_out:
                raise RuntimeError("Resposta vazia recebida da sessão web do Gemini Pro.")
            return text_out

    @staticmethod
    def _parse_bard_stream_response(raw_body: str) -> str:
        best_text = ""
        for line in raw_body.splitlines():
            line = line.strip()
            if not line.startswith("["):
                continue
            try:
                parsed = json.loads(line)
            except Exception:
                continue
            for item in parsed:
                if not isinstance(item, list) or len(item) < 3 or item[0] != "wrb.fr":
                    continue
                payload_str = item[2]
                if not isinstance(payload_str, str):
                    continue
                try:
                    inner = json.loads(payload_str)
                    candidates = inner[4]
                    if candidates and isinstance(candidates, list):
                        first_candidate = candidates[0]
                        if isinstance(first_candidate, list) and len(first_candidate) > 1:
                            parts = first_candidate[1]
                            if isinstance(parts, list) and parts and isinstance(parts[0], str):
                                candidate_text = parts[0]
                                if len(candidate_text) >= len(best_text):
                                    best_text = candidate_text
                except Exception:
                    continue
        return best_text

    async def _complete_via_google_token(
        self,
        prompt: str,
        token: str,
        model_id: str = "gemini-3.1-flash-lite",
        force_json: bool = False,
        is_api_key: bool = False,
    ) -> str:
        clean_model = model_id.replace("mcp:", "").replace("google-gla:", "").strip() or "gemini-3.1-flash-lite"
        candidate_models = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-3.8-flash"]
        if clean_model not in {"gemini-pro", "gemini-2.5-pro", "gemini-2.5-flash"} and clean_model not in candidate_models:
            candidate_models.insert(0, clean_model)

        headers = {"Content-Type": "application/json"}
        params: Dict[str, str] = {}
        if is_api_key or token.startswith("AIza"):
            params["key"] = token
        else:
            headers["Authorization"] = f"Bearer {token}"

        generation_config: Dict[str, Any] = {"temperature": 0.3}
        if force_json:
            generation_config["responseMimeType"] = "application/json"

        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }

        last_err = ""
        async with httpx.AsyncClient(timeout=45.0) as client:
            for candidate in candidate_models:
                url = f"{GOOGLE_GENERATIVE_LANGUAGE_URL}/models/{candidate}:generateContent"
                try:
                    resp = await client.post(url, params=params, headers=headers, json=payload)
                    if resp.status_code != 200:
                        last_err = f"HTTP {resp.status_code} ({candidate}): {resp.text[:200]}"
                        continue
                    data = resp.json()
                    candidates = data.get("candidates") or []
                    if not candidates:
                        last_err = f"Sem candidatos ({candidate})"
                        continue
                    parts = candidates[0].get("content", {}).get("parts") or []
                    text_out = "".join(str(p.get("text", "")) for p in parts if "text" in p).strip()
                    if text_out:
                        return text_out
                except Exception as exc:
                    last_err = f"{candidate}: {exc}"
                    continue

        raise RuntimeError(last_err or "Nenhum modelo Gemini respondeu com sucesso.")

    async def _complete_via_external_mcp(
        self,
        prompt: str,
        system_prompt: Optional[str],
        model_id: str,
        json_schema: Optional[Dict[str, Any]],
    ) -> str:
        url = self.external_server_url.rstrip("/")
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if self.external_auth_token:
            headers["Authorization"] = f"Bearer {self.external_auth_token}"

        full_prompt = prompt
        if system_prompt:
            full_prompt = f"{system_prompt}\n\n{prompt}"
        if json_schema:
            full_prompt += f"\n\nReturn JSON matching schema: {json.dumps(json_schema)}"

        async with httpx.AsyncClient(timeout=180.0) as client:
            # Support both OpenAI-compatible MCP proxy endpoints and JSON-RPC MCP servers
            if url.endswith("/chat/completions") or url.endswith("/v1"):
                endpoint = url if url.endswith("/chat/completions") else f"{url}/chat/completions"
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": full_prompt})
                resp = await client.post(
                    endpoint,
                    headers=headers,
                    json={"model": model_id.replace("mcp:", ""), "messages": messages, "temperature": 0.3},
                )
                if resp.status_code != 200:
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:250]}")
                data = resp.json()
                return data["choices"][0]["message"]["content"]

            # JSON-RPC 2.0 MCP tools/call
            rpc_payload = {
                "jsonrpc": "2.0",
                "id": str(uuid.uuid4()),
                "method": "tools/call",
                "params": {
                    "name": "gemini_generate",
                    "arguments": {
                        "prompt": full_prompt,
                        "model": model_id.replace("mcp:", ""),
                    },
                },
            }
            resp = await client.post(url, headers=headers, json=rpc_payload)
            if resp.status_code != 200:
                raise RuntimeError(f"MCP Server HTTP {resp.status_code}: {resp.text[:250]}")
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"MCP RPC Error: {data['error']}")
            result = data.get("result", {})
            content_list = result.get("content", [])
            if isinstance(content_list, list) and content_list:
                return "\n".join(str(item.get("text", "")) for item in content_list if isinstance(item, dict))
            if isinstance(result, str):
                return result
            return json.dumps(result, ensure_ascii=False)

    async def generate_flow_image(
        self, prompt: str, aspect_ratio: str = "IMAGE_ASPECT_RATIO_PORTRAIT"
    ) -> Dict[str, Any]:
        """Generate a 9:16 thumbnail background image via Google Flow (ImageFX / Imagen 3)."""
        enhanced_prompt = (
            f"High impact vertical 9:16 social media video thumbnail background, "
            f"cinematic lighting, vibrant colors, depth of field, no text, no letters: {prompt.strip()}"
        )

        # 1. Try Google Labs Flow (ImageFX) token if configured
        if self.flow_auth_token:
            try:
                token = self.flow_auth_token
                if token.lower().startswith("bearer "):
                    token = token[7:].strip()
                headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Origin": "https://labs.google",
                    "Referer": "https://labs.google/fx/tools/flow",
                    "User-Agent": DEFAULT_USER_AGENT,
                }
                payload = {
                    "userInput": {
                        "candidatesCount": 1,
                        "prompts": [enhanced_prompt],
                        "seed": int(time.time()) % 100000,
                    },
                    "clientContext": {
                        "sessionId": f";{int(time.time() * 1000)}",
                        "tool": "IMAGE_FX",
                    },
                    "modelInput": {"modelNameType": "IMAGEN_3_1"},
                    "aspectRatio": aspect_ratio,
                }
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(GOOGLE_FLOW_IMAGEFX_URL, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        panels = data.get("imagePanels") or []
                        if panels and panels[0].get("generatedImages"):
                            encoded = panels[0]["generatedImages"][0].get("encodedImage")
                            if encoded:
                                return {
                                    "data_url": f"data:image/png;base64,{encoded}",
                                    "provider": "google-flow-imagen3",
                                    "prompt": enhanced_prompt,
                                }
            except Exception as exc:
                logger.warning("Google Labs Flow ImageFX call failed: %s", exc)

        # 2. Try Google Generative Language Imagen API if OAuth token or GOOGLE_API_KEY is available
        api_token = self.oauth_token or self.config.google_api_key
        if api_token:
            try:
                url = f"{GOOGLE_GENERATIVE_LANGUAGE_URL}/models/imagen-3.0-generate-002:predict"
                headers = {"Content-Type": "application/json"}
                params: Dict[str, str] = {}
                if api_token.startswith("AIza"):
                    params["key"] = api_token
                else:
                    headers["Authorization"] = f"Bearer {api_token}"
                payload = {
                    "instances": [{"prompt": enhanced_prompt}],
                    "parameters": {"sampleCount": 1, "aspectRatio": "9:16"},
                }
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(url, params=params, headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        preds = data.get("predictions") or []
                        if preds and preds[0].get("bytesBase64Encoded"):
                            b64 = preds[0]["bytesBase64Encoded"]
                            mime = preds[0].get("mimeType", "image/png")
                            return {
                                "data_url": f"data:{mime};base64,{b64}",
                                "provider": "gemini-imagen3",
                                "prompt": enhanced_prompt,
                            }
            except Exception as exc:
                logger.warning("Gemini Imagen 3 fallback failed: %s", exc)

        # 3. If Gemini Pro web session is active, ask Gemini Pro to generate a custom thematic SVG artwork
        if self.session_psid:
            try:
                svg_prompt = (
                    "Generate ONLY a valid, self-contained <svg xmlns=\"http://www.w3.org/2000/svg\" "
                    "width=\"1080\" height=\"1920\" viewBox=\"0 0 1080 1920\">...</svg> code (no markdown explanation, "
                    "no text/letters inside the SVG) for a dark, cinematic, high-contrast social media thumbnail "
                    "background with glowing gradients, abstract geometric shapes, and lighting inspired by: "
                    f"{prompt.strip()[:200]}"
                )
                raw_svg = await self._complete_via_gemini_web_session(svg_prompt)
                svg_match = re.search(r"(<svg[\s\S]*?</svg>)", raw_svg, re.IGNORECASE)
                if svg_match:
                    svg_code = svg_match.group(1)
                    encoded = base64.b64encode(svg_code.encode("utf-8")).decode("ascii")
                    return {
                        "data_url": f"data:image/svg+xml;base64,{encoded}",
                        "provider": "gemini-pro-flow-unified",
                        "prompt": enhanced_prompt,
                    }
            except Exception as exc:
                logger.warning("Gemini Pro unified SVG background generation failed: %s", exc)

        # 4. Studio procedural fallback
        svg_data_url = self._build_cinematic_svg_background(prompt)
        return {
            "data_url": svg_data_url,
            "provider": "flow-studio-procedural",
            "prompt": enhanced_prompt,
        }

    @staticmethod
    def _build_cinematic_svg_background(prompt: str) -> str:
        """Create a high-contrast 1080x1920 studio background SVG data URI inspired by the prompt."""
        seed = sum(ord(c) for c in (prompt or "supoclip"))
        palettes = [
            ("#090D16", "#1E1B4B", "#F59E0B", "#EC4899"),
            ("#050811", "#064E3B", "#10B981", "#3B82F6"),
            ("#0F0718", "#4C1D95", "#F43F5E", "#FBBF24"),
            ("#0A0A0A", "#1E293B", "#38BDF8", "#818CF8"),
        ]
        bg1, bg2, accent1, accent2 = palettes[seed % len(palettes)]
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg1}"/>
      <stop offset="55%" stop-color="{bg2}"/>
      <stop offset="100%" stop-color="#050507"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0.25" cy="0.3" r="0.55">
      <stop offset="0%" stop-color="{accent1}" stop-opacity="0.48"/>
      <stop offset="100%" stop-color="{accent1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.8" cy="0.7" r="0.6">
      <stop offset="0%" stop-color="{accent2}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="{accent2}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <circle cx="270" cy="576" r="650" fill="url(#glow1)"/>
  <circle cx="864" cy="1344" r="720" fill="url(#glow2)"/>
</svg>"""
        encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        return f"data:image/svg+xml;base64,{encoded}"
