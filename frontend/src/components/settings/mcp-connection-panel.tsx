"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  KeyRound,
  Loader2,
  PlugZap,
  Sparkles,
  Wand2,
  AlertCircle,
  Check,
  Settings2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MCPToolInfo {
  name: string;
  title: string;
  provider: string;
  ready: boolean;
}

interface MCPStatusSummary {
  gemini: {
    enabled: boolean;
    configured: boolean;
    auth_mode: "session_cookie" | "oauth_token" | "external_mcp";
    has_session_psid: boolean;
    has_session_psidts: boolean;
    has_oauth_token: boolean;
    has_external_url: boolean;
    external_server_url: string;
    has_fallback_api_key: boolean;
  };
  flow: {
    enabled: boolean;
    configured: boolean;
    unified_with_gemini?: boolean;
    has_flow_token: boolean;
    project_id: string;
  };
  active_llm: string;
  is_mcp_active_llm: boolean;
  tools: MCPToolInfo[];
}

export function McpConnectionPanel({ onSettingsChanged }: { onSettingsChanged?: () => void }) {
  const [status, setStatus] = useState<MCPStatusSummary | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [authMode, setAuthMode] = useState<"session_cookie" | "oauth_token" | "external_mcp">("session_cookie");
  const [sessionPsid, setSessionPsid] = useState("");
  const [sessionPsidts, setSessionPsidts] = useState("");
  const [oauthToken, setOauthToken] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalToken, setExternalToken] = useState("");
  const [flowToken, setFlowToken] = useState("");
  const [flowProjectId, setFlowProjectId] = useState("");
  const [mcpModelVariant, setMcpModelVariant] = useState("mcp:gemini-pro");

  const [showGuide, setShowGuide] = useState(false);
  const [showAdvancedFlow, setShowAdvancedFlow] = useState(false);
  const [customTestPrompt, setCustomTestPrompt] = useState(
    "Confirme que você está conectado ao SupoClip via MCP e sugira 2 títulos virais sobre Inteligência Artificial."
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isActivatingLlm, setIsActivatingLlm] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
    details?: string;
  } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/mcp/status", { cache: "no-store" });
      if (res.ok) {
        const data: MCPStatusSummary = await res.json();
        setStatus(data);
        setAuthMode(data.gemini.auth_mode || "session_cookie");
        if (data.gemini.external_server_url) {
          setExternalUrl(data.gemini.external_server_url);
        }
        if (data.flow.project_id) {
          setFlowProjectId(data.flow.project_id);
        }
        if (data.active_llm?.startsWith("mcp:")) {
          setMcpModelVariant(data.active_llm);
        }
      }
    } catch {
      // Ignore initial status error
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const buildPendingUpdates = () => {
    const updates: Record<string, string> = {
      MCP_GEMINI_ENABLED: "true",
      MCP_FLOW_ENABLED: "true",
      MCP_GEMINI_AUTH_MODE: authMode,
      MCP_EXTERNAL_SERVER_URL: externalUrl.trim(),
      MCP_FLOW_PROJECT_ID: flowProjectId.trim(),
    };
    if (sessionPsid.trim()) updates.MCP_GEMINI_SESSION_PSID = sessionPsid.trim();
    if (sessionPsidts.trim()) updates.MCP_GEMINI_SESSION_PSIDTS = sessionPsidts.trim();
    if (oauthToken.trim()) updates.MCP_GEMINI_OAUTH_TOKEN = oauthToken.trim();
    if (externalToken.trim()) updates.MCP_EXTERNAL_AUTH_TOKEN = externalToken.trim();
    if (flowToken.trim()) updates.MCP_FLOW_AUTH_TOKEN = flowToken.trim();
    return updates;
  };

  const handleSaveMcpSettings = async (activateAsDefaultLlm = false) => {
    if (activateAsDefaultLlm) {
      setIsActivatingLlm(true);
    } else {
      setIsSaving(true);
    }
    setFeedback(null);

    try {
      const updates = buildPendingUpdates();
      if (activateAsDefaultLlm) {
        updates.LLM = mcpModelVariant;
        updates.RERANK_LLM = mcpModelVariant;
      }

      const preferAdminValues: Record<string, boolean> = {};
      for (const k of Object.keys(updates)) {
        preferAdminValues[k] = true;
      }

      const response = await fetch("/api/settings/generation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates,
          delete_keys: [],
          prefer_admin_values: preferAdminValues,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Falha ao salvar configurações MCP.");
      }

      setSessionPsid("");
      setSessionPsidts("");
      setOauthToken("");
      setExternalToken("");
      setFlowToken("");

      await fetchStatus();
      onSettingsChanged?.();

      setFeedback({
        tone: "success",
        message: activateAsDefaultLlm
          ? `Conta Gemini Pro & Flow salva e ativada como IA principal (${mcpModelVariant})!`
          : "Credenciais MCP (Gemini Pro & Google Flow) salvas com sucesso!",
      });
    } catch (err) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Erro ao salvar configurações MCP.",
      });
    } finally {
      setIsSaving(false);
      setIsActivatingLlm(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const overrides = buildPendingUpdates();
      const response = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "both",
          custom_prompt: customTestPrompt.trim() || undefined,
          overrides,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Falha ao testar conexão MCP.");
      }

      const geminiRes = data.results?.gemini;
      const flowRes = data.results?.flow;
      if (geminiRes?.ok) {
        setFeedback({
          tone: "success",
          message: `${geminiRes.message} (${geminiRes.latency_ms}ms)`,
          details: flowRes?.ok
            ? `${flowRes.message} · Resposta Gemini: "${geminiRes.sample_reply}"`
            : `Resposta Gemini: "${geminiRes.sample_reply}"`,
        });
      } else {
        setFeedback({
          tone: "error",
          message: geminiRes?.message || "Não foi possível validar a conexão Gemini Pro.",
          details: flowRes?.message,
        });
      }
      if (data.status) {
        setStatus(data.status);
      }
    } catch (err) {
      setFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Erro ao testar conexão MCP.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="border-brand/30 bg-gradient-to-br from-brand/5 via-background to-background shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <PlugZap className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg">
                  Conector MCP Simplificado: Gemini Pro &amp; Google Flow
                </CardTitle>
                {status?.gemini.configured ? (
                  <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                    <Check className="mr-1 size-3" /> Gemini Pro &amp; Flow Conectados
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Aguardando credenciais
                  </Badge>
                )}
                {status?.is_mcp_active_llm && (
                  <Badge variant="secondary" className="border-brand/40 bg-brand/15 text-brand">
                    IA Principal Ativa ({status.active_llm})
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                <strong>Modo Simplificado Ativo:</strong> Os seus 2 cookies da conta Google (
                <code>__Secure-1PSID</code> e <code>__Secure-1PSIDTS</code>) conectam{" "}
                <strong>automaticamente</strong> tanto o <strong>Gemini Pro</strong> quanto o{" "}
                <strong>Google Flow</strong> (sem precisar procurar chaves extras).
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {feedback && (
          <Alert
            variant={feedback.tone === "error" ? "destructive" : "default"}
            className={
              feedback.tone === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : undefined
            }
          >
            {feedback.tone === "success" ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>
              <p className="font-medium">{feedback.message}</p>
              {feedback.details && (
                <p className="mt-1 text-xs opacity-85">{feedback.details}</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Section 1: Unified Gemini Pro + Flow Session */}
        <div className="rounded-xl border bg-background/80 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-brand" />
              <h3 className="text-sm font-semibold">
                Sessão Unificada Google (Gemini Pro + Flow)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              Como copiar os 2 cookies no navegador?
              {showGuide ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>

          {showGuide && (
            <div className="rounded-lg border border-brand/20 bg-brand/5 p-3.5 text-xs space-y-2 text-muted-foreground">
              <p className="font-semibold text-foreground">
                Passo a passo simplificado (apenas 2 chaves):
              </p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>
                  Acesse{" "}
                  <a
                    href="https://gemini.google.com/app"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-foreground underline inline-flex items-center gap-0.5"
                  >
                    gemini.google.com <ExternalLink className="size-3" />
                  </a>{" "}
                  logado na sua conta Google Pro.
                </li>
                <li>
                  Pressione <kbd className="rounded border bg-background px-1">F12</kbd> → aba{" "}
                  <strong>Application (Aplicativo)</strong> → <strong>Cookies</strong> →{" "}
                  <code>https://gemini.google.com</code>.
                </li>
                <li>
                  Copie apenas o valor de <code>__Secure-1PSID</code> e <code>__Secure-1PSIDTS</code>. O SupoClip cuidará automaticamente do Gemini Pro e do Flow com essas duas chaves!
                </li>
              </ol>
            </div>
          )}

          {authMode === "session_cookie" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mcp-psid" className="text-xs">
                    1. Cookie <code>__Secure-1PSID</code>
                  </Label>
                  {status?.gemini.has_session_psid && (
                    <span className="text-[11px] font-medium text-emerald-600">
                      ✓ Ativo e Criptografado
                    </span>
                  )}
                </div>
                <Input
                  id="mcp-psid"
                  type="password"
                  value={sessionPsid}
                  onChange={(e) => setSessionPsid(e.target.value)}
                  placeholder={
                    status?.gemini.has_session_psid
                      ? "•••••••••••••••• (salvo — digite para atualizar)"
                      : "Cole o valor de __Secure-1PSID..."
                  }
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mcp-psidts" className="text-xs">
                    2. Cookie <code>__Secure-1PSIDTS</code>
                  </Label>
                  {status?.gemini.has_session_psidts && (
                    <span className="text-[11px] font-medium text-emerald-600">
                      ✓ Ativo e Criptografado
                    </span>
                  )}
                </div>
                <Input
                  id="mcp-psidts"
                  type="password"
                  value={sessionPsidts}
                  onChange={(e) => setSessionPsidts(e.target.value)}
                  placeholder={
                    status?.gemini.has_session_psidts
                      ? "•••••••••••••••• (salvo — digite para atualizar)"
                      : "Cole o valor de __Secure-1PSIDTS..."
                  }
                />
              </div>
            </div>
          )}

          {/* Collapsible Advanced Options */}
          <div className="pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowAdvancedFlow((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings2 className="size-3.5" />
              Opções Avançadas (Trocar variante do modelo, Servidor MCP Externo ou Token Flow dedicado)
              {showAdvancedFlow ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>

            {showAdvancedFlow && (
              <div className="mt-4 space-y-4 rounded-lg border bg-muted/20 p-3.5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Modo de Conexão</Label>
                    <Select
                      value={authMode}
                      onValueChange={(v) =>
                        setAuthMode(v as "session_cookie" | "oauth_token" | "external_mcp")
                      }
                    >
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="session_cookie">
                          Modo Simplificado (Cookies __Secure-1PSID + Flow Unificado)
                        </SelectItem>
                        <SelectItem value="oauth_token">
                          Token OAuth Google / Gemini CLI (Bearer)
                        </SelectItem>
                        <SelectItem value="external_mcp">
                          Servidor MCP Externo (URL SSE / JSON-RPC)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Variante do Modelo MCP</Label>
                    <Select value={mcpModelVariant} onValueChange={setMcpModelVariant}>
                      <SelectTrigger className="w-full h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mcp:gemini-pro">
                          mcp:gemini-pro (Gemini Pro — Recomendado)
                        </SelectItem>
                        <SelectItem value="mcp:gemini-2.5-pro">
                          mcp:gemini-2.5-pro (Raciocínio Profundo)
                        </SelectItem>
                        <SelectItem value="mcp:gemini-2.5-flash">
                          mcp:gemini-2.5-flash (Ultra Rápido)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {authMode === "oauth_token" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="mcp-oauth" className="text-xs">
                      Token OAuth2 Google AI Pro (<code>ya29...</code>)
                    </Label>
                    <Input
                      id="mcp-oauth"
                      type="password"
                      value={oauthToken}
                      onChange={(e) => setOauthToken(e.target.value)}
                      placeholder="ya29.a0AfH6SM..."
                    />
                  </div>
                )}

                {authMode === "external_mcp" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-ext-url" className="text-xs">
                        URL do Servidor MCP Externo
                      </Label>
                      <Input
                        id="mcp-ext-url"
                        type="text"
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        placeholder="http://host.docker.internal:8090/mcp"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-ext-token" className="text-xs">
                        Token do Servidor MCP (Opcional)
                      </Label>
                      <Input
                        id="mcp-ext-token"
                        type="password"
                        value={externalToken}
                        onChange={(e) => setExternalToken(e.target.value)}
                        placeholder="Bearer token opcional..."
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="flow-token" className="text-xs flex items-center gap-1.5">
                      <Wand2 className="size-3.5 text-brand" />
                      Token Dedicado ImageFX / Flow (Opcional — já funciona sem preencher)
                    </Label>
                  </div>
                  <Input
                    id="flow-token"
                    type="password"
                    value={flowToken}
                    onChange={(e) => setFlowToken(e.target.value)}
                    placeholder="Opcional: deixe em branco para usar a sessão unificada do Gemini Pro"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tools status pills */}
        {!loadingStatus && status?.tools && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Capacidades MCP ativas na sua conta:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {status.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs"
                >
                  <span className="font-medium truncate pr-2">{tool.title}</span>
                  <Badge
                    variant={tool.ready ? "default" : "outline"}
                    className={
                      tool.ready
                        ? "bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15 border-emerald-200"
                        : "text-muted-foreground"
                    }
                  >
                    {tool.ready ? "Ativo" : "Pendente"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interactive Live Command Console */}
        <div className="rounded-xl border bg-background/80 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="mcp-custom-prompt" className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-brand" />
              Testar Comando ao Vivo na Sua Conta (Ping &amp; Resposta Real)
            </Label>
            <span className="text-[11px] text-muted-foreground">
              Envie qualquer comando para validar a resposta da IA
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="mcp-custom-prompt"
              value={customTestPrompt}
              onChange={(e) => setCustomTestPrompt(e.target.value)}
              placeholder="Digite um comando para testar sua conta Gemini Pro..."
              className="text-xs flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving || isActivatingLlm}
              className="shrink-0 border-brand/40 text-brand hover:bg-brand/10"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Enviando comando...
                </>
              ) : (
                <>
                  <KeyRound className="mr-1.5 size-3.5" />
                  Enviar Comando &amp; Testar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTesting || isSaving || isActivatingLlm}
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Testando MCP...
              </>
            ) : (
              <>
                <KeyRound className="mr-1.5 size-4" />
                Testar Conexão MCP
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSaveMcpSettings(false)}
            disabled={isSaving || isTesting || isActivatingLlm}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Credenciais MCP"
            )}
          </Button>

          <Button
            type="button"
            onClick={() => void handleSaveMcpSettings(true)}
            disabled={isActivatingLlm || isSaving || isTesting}
          >
            {isActivatingLlm ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Ativando...
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 size-4" />
                Salvar e Usar como IA Principal
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
