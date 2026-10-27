"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  Flame,
  HelpCircle,
  KeyRound,
  Layers,
  Mic,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RuntimeSetting } from "@/components/admin/runtime-settings-form";

interface GenerationSettingsFormProps {
  settings: RuntimeSetting[];
  apiEndpoint?: string;
}

type DurationPreset = {
  id: string;
  label: string;
  description: string;
  min: number;
  max: number;
  idealMin: number;
  idealMax: number;
  target: number;
  recommended?: boolean;
};

const DURATION_PRESETS: DurationPreset[] = [
  {
    id: "shorts-reels",
    label: "Shorts, Reels & TikTok",
    description: "60s a 90s — Formato ideal para monetização e retenção (mínimo de 1 minuto)",
    min: 60,
    max: 90,
    idealMin: 60,
    idealMax: 90,
    target: 60,
    recommended: true,
  },
  {
    id: "extended",
    label: "Contexto Estendido",
    description: "60s a 120s — Cortes mais profundos com introdução e fechamento detalhados",
    min: 60,
    max: 120,
    idealMin: 60,
    idealMax: 120,
    target: 60,
  },
  {
    id: "classic-short",
    label: "Cortes Rápidos",
    description: "30s a 60s — Formato curto tradicional para momentos de impacto direto",
    min: 30,
    max: 60,
    idealMin: 30,
    idealMax: 60,
    target: 45,
  },
];

const GEMINI_MODELS = [
  {
    id: "google-gla:gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    badge: "Recomendado",
    description: "Ultra-rápido (~2s de inferência), alta precisão e sem limites estritos de taxa.",
  },
  {
    id: "google-gla:gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    badge: "Nova Geração",
    description: "Modelo de ponta do Google com virality scoring e raciocínio avançado.",
  },
  {
    id: "google-gla:gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    badge: "Estável",
    description: "Alta estabilidade e consistência comprovada para cortes longos.",
  },
];

const WHISPER_SIZES = [
  { id: "base", name: "base", hint: "Recomendado para CPU — Rápido com boa precisão em PT-BR e EN" },
  { id: "small", name: "small", hint: "Equilíbrio superior de precisão para vídeos com sotaques" },
  { id: "tiny", name: "tiny", hint: "Ultrarrápido, menor pegada de memória" },
  { id: "medium", name: "medium", hint: "Mais pesado e detalhado (requer mais memória/CPU)" },
];

const LANGUAGE_OPTIONS = [
  { id: "", label: "Detecção Automática", hint: "Auto-detect" },
  { id: "pt", label: "Português", hint: "pt-BR" },
  { id: "en", label: "English", hint: "en-US" },
  { id: "es", label: "Español", hint: "es" },
  { id: "fr", label: "Français", hint: "fr" },
  { id: "de", label: "Deutsch", hint: "de" },
  { id: "it", label: "Italiano", hint: "it" },
];

export function GenerationSettingsForm({
  settings,
  apiEndpoint = "/api/settings/generation",
}: GenerationSettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);

  // Map settings to lookup by key
  const settingsMap = useMemo(
    () => new Map(settings.map((s) => [s.key, s])),
    [settings]
  );

  // Form values state
  const [values, setValues] = useState<Record<string, string>>({});

  // Helper to get current value (override or loaded)
  const getValue = (key: string, fallback: string = ""): string => {
    if (values[key] !== undefined) return values[key];
    const s = settingsMap.get(key);
    if (!s) return fallback;
    return fallback;
  };

  // State for parsed active values
  const currentLlm = values["LLM"] ?? "google-gla:gemini-3.1-flash-lite";
  const currentTranscription = values["TRANSCRIPTION_PROVIDER"] ?? "whisper";
  const currentWhisperSize = values["WHISPER_MODEL_SIZE"] ?? "base";
  const currentLanguage = values["TRANSCRIPTION_LANGUAGE"] ?? "";
  const currentContext = values["DEFAULT_GENERATION_CONTEXT"] ?? "";
  const minClipDuration = Number(values["MIN_CLIP_DURATION"] ?? 60);
  const maxClipDuration = Number(values["MAX_CLIP_DURATION"] ?? 90);
  const idealMinDuration = Number(values["IDEAL_CLIP_MIN_DURATION"] ?? 60);
  const idealMaxDuration = Number(values["IDEAL_CLIP_MAX_DURATION"] ?? 90);
  const maxClips = Number(values["MAX_CLIPS"] ?? 10);
  const timeoutSeconds = Number(values["ANALYSIS_TOTAL_TIMEOUT_SECONDS"] ?? 7200);

  // Has changes
  const hasChanges = Object.keys(values).length > 0;

  const handleUpdate = (key: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const applyPreset = (preset: DurationPreset) => {
    setValues((prev) => ({
      ...prev,
      MIN_CLIP_DURATION: String(preset.min),
      MAX_CLIP_DURATION: String(preset.max),
      IDEAL_CLIP_MIN_DURATION: String(preset.idealMin),
      IDEAL_CLIP_MAX_DURATION: String(preset.idealMax),
      CLIP_DURATION: String(preset.target),
    }));
    toast.info(`Preset aplicado: ${preset.label} (${preset.min}s a ${preset.max}s)`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetch(apiEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: values,
          delete_keys: [],
          prefer_admin_values: Object.fromEntries(
            Object.keys(values).map((k) => [k, true])
          ),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.detail || errorData?.error || "Falha ao salvar configurações de geração."
        );
      }

      toast.success(
        "Configurações atualizadas com sucesso! Os novos parâmetros já estão em vigor para as próximas gerações sem reiniciar o servidor."
      );
      setValues({});
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  // Check matching preset
  const activePreset = DURATION_PRESETS.find(
    (p) =>
      p.min === minClipDuration &&
      p.max === maxClipDuration &&
      p.idealMin === idealMinDuration &&
      p.idealMax === idealMaxDuration
  );

  return (
    <form onSubmit={handleSave} className="space-y-8">
      {/* Live / Zero-restart Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand text-background">
            <Zap className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span>Arquitetura Zero-Restart Ativa</span>
              <Badge variant="outline" className="border-brand/40 bg-brand/10 text-brand">
                Em tempo real
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Qualquer parâmetro salvo nesta tela entra em vigor imediatamente nas tarefas e na API,
              sem necessidade de reiniciar contêineres ou comandos bash.
            </p>
          </div>
        </div>
        {hasChanges && (
          <Button
            type="submit"
            disabled={isSaving || isPending}
            className="shrink-0 gap-2 bg-brand text-background hover:bg-brand/90"
          >
            {isSaving ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar alterações
          </Button>
        )}
      </div>

      {/* SECTION 1: LLM & Provedores de IA */}
      <section className="rounded-2xl border bg-background p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Bot className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">1. Inteligência Artificial (LLM)</h2>
              <p className="text-xs text-muted-foreground">
                Selecione o cérebro que analisa o vídeo e identifica os momentos com alto potencial de viralização.
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {currentLlm}
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          {/* Quick Models Grid */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Modelos Google Gemini (Recomendados para Nuvem)
            </Label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {GEMINI_MODELS.map((model) => {
                const isSelected = currentLlm === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleUpdate("LLM", model.id)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand"
                        : "hover:border-foreground/20 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-sm">{model.name}</span>
                      <Badge variant={isSelected ? "default" : "outline"} className="text-[10px]">
                        {model.badge}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {model.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom LLM Identifier */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Identificador do Modelo (LLM)
              </Label>
              <Input
                value={currentLlm}
                onChange={(e) => handleUpdate("LLM", e.target.value)}
                placeholder="ex: google-gla:gemini-3.1-flash-lite ou ollama:llama3.2:latest"
                className="mt-2 font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Exemplos: <code className="text-foreground">google-gla:gemini-3.1-flash-lite</code>,{" "}
                <code className="text-foreground">ollama:llama3.2:latest</code>,{" "}
                <code className="text-foreground">openai:gpt-5.2</code>
              </p>
            </div>

            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chave GOOGLE_API_KEY (Gemini Studio)
              </Label>
              <Input
                type="password"
                value={values["GOOGLE_API_KEY"] ?? ""}
                onChange={(e) => handleUpdate("GOOGLE_API_KEY", e.target.value)}
                placeholder={
                  settingsMap.get("GOOGLE_API_KEY")?.configured
                    ? "✓ Chave salva e ativa (digite para alterar)"
                    : "Cole sua chave do Google AI Studio"
                }
                className="mt-2 text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Gere gratuitamente em{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline underline-offset-2"
                >
                  aistudio.google.com/apikey
                </a>
              </p>
            </div>
          </div>

          {/* Local Ollama Option */}
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <span className="text-xs font-semibold">Ollama Local (Privacidade Total)</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Para usar IA rodando 100% no seu hardware sem gastar tokens, configure o modelo com o prefixo{" "}
              <code className="font-mono text-foreground">ollama:nome-do-modelo</code> (ex:{" "}
              <code className="font-mono text-foreground">ollama:llama3.2:latest</code>).
            </p>
          </div>

          {/* Default Context / Direction */}
          <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contexto Criativo Padrão da IA (Opcional)
              </Label>
              <Badge variant="outline" className="text-[10px]">
                Direcionamento Global
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Instrução padrão passada ao modelo de IA para orientar a seleção e o tom dos cortes caso nenhum contexto específico seja informado na criação.
            </p>
            <textarea
              rows={2}
              value={currentContext}
              onChange={(e) => handleUpdate("DEFAULT_GENERATION_CONTEXT", e.target.value)}
              placeholder="Ex: Focar nas melhores lições práticas de negócios, ganchos com números e momentos de alto impacto..."
              className="w-full rounded-lg border bg-background p-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: Transcrição de Áudio */}
      <section className="rounded-2xl border bg-background p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Mic className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">2. Motor de Transcrição de Áudio</h2>
              <p className="text-xs text-muted-foreground">
                Escolha entre transcrição local gratuita (Whisper) ou transcrição na nuvem (AssemblyAI).
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="font-mono text-xs uppercase">
            {currentTranscription}
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          {/* Provider Toggle Cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleUpdate("TRANSCRIPTION_PROVIDER", "whisper")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                currentTranscription === "whisper"
                  ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand"
                  : "hover:border-foreground/20 hover:bg-muted/40"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold text-sm">Whisper Local (Host)</span>
                <Badge variant={currentTranscription === "whisper" ? "default" : "outline"} className="text-[10px]">
                  100% Gratuito &amp; Privado
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Executa localmente no contêiner com timestamps precisos de palavras, sem necessidade de chaves de API pagas.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleUpdate("TRANSCRIPTION_PROVIDER", "assemblyai")}
              className={cn(
                "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                currentTranscription === "assemblyai"
                  ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand"
                  : "hover:border-foreground/20 hover:bg-muted/40"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold text-sm">AssemblyAI Cloud</span>
                <Badge variant={currentTranscription === "assemblyai" ? "default" : "outline"} className="text-[10px]">
                  Cloud API
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Processamento remoto veloz na nuvem da AssemblyAI. Requer chave ASSEMBLY_AI_API_KEY.
              </p>
            </button>
          </div>

          {/* Whisper Models */}
          {currentTranscription === "whisper" && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tamanho do Modelo Whisper
              </Label>
              <div className="grid gap-2 sm:grid-cols-4">
                {WHISPER_SIZES.map((size) => {
                  const isSelected = currentWhisperSize === size.id;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => handleUpdate("WHISPER_MODEL_SIZE", size.id)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        isSelected
                          ? "border-brand bg-background shadow-xs font-semibold text-brand ring-1 ring-brand"
                          : "bg-background hover:bg-muted/50"
                      )}
                    >
                      <div className="text-sm uppercase font-mono">{size.name}</div>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-tight">
                        {size.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* AssemblyAI Key */}
          {currentTranscription === "assemblyai" && (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chave ASSEMBLY_AI_API_KEY
              </Label>
              <Input
                type="password"
                value={values["ASSEMBLY_AI_API_KEY"] ?? ""}
                onChange={(e) => handleUpdate("ASSEMBLY_AI_API_KEY", e.target.value)}
                placeholder={
                  settingsMap.get("ASSEMBLY_AI_API_KEY")?.configured
                    ? "✓ Chave salva e ativa"
                    : "Cole sua chave AssemblyAI"
                }
                className="mt-2 text-xs"
              />
            </div>
          )}

          {/* Default Transcription Language */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Idioma Padrão da Legenda &amp; Transcrição
              </Label>
              <Badge variant="outline" className="text-[10px]">
                {currentLanguage ? currentLanguage.toUpperCase() : "AUTO"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Define o idioma de áudio padrão para Whisper/AssemblyAI e instrui a IA a gerar títulos e justificativas no mesmo idioma.
            </p>
            <div className="grid gap-2 sm:grid-cols-4">
              {LANGUAGE_OPTIONS.map((lang) => {
                const isSelected = currentLanguage === lang.id;
                return (
                  <button
                    key={lang.id || "auto"}
                    type="button"
                    onClick={() => handleUpdate("TRANSCRIPTION_LANGUAGE", lang.id)}
                    className={cn(
                      "rounded-lg border p-2.5 text-left transition-all",
                      isSelected
                        ? "border-brand bg-background shadow-xs font-semibold text-brand ring-1 ring-brand"
                        : "bg-background hover:bg-muted/50"
                    )}
                  >
                    <div className="text-xs font-medium">{lang.label}</div>
                    <div className="text-[10px] text-muted-foreground">{lang.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Duração e Formato dos Clipes */}
      <section className="rounded-2xl border bg-background p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Clock className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">3. Parâmetros de Duração dos Clipes</h2>
              <p className="text-xs text-muted-foreground">
                Defina o tamanho mínimo, máximo e ideal dos cortes gerados para redes sociais.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {minClipDuration}s — {maxClipDuration}s
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          {/* Preset Buttons */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Presets Rápidos de Duração
            </Label>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {DURATION_PRESETS.map((preset) => {
                const isSelected = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
                      isSelected
                        ? "border-brand bg-brand/5 shadow-xs ring-1 ring-brand"
                        : "hover:border-foreground/20 hover:bg-muted/40"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-sm">{preset.label}</span>
                      {preset.recommended && (
                        <Badge variant="default" className="text-[10px]">
                          Recomendado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {preset.description}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs font-mono font-medium text-foreground">
                      <span>{preset.min}s a {preset.max}s</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Range Visualizer */}
          <div className="rounded-xl border bg-muted/10 p-5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Faixa de Duração Ativa</span>
              <span className="font-mono text-foreground font-semibold">
                Mínimo: {minClipDuration}s | Ideal: {idealMinDuration}s–{idealMaxDuration}s | Máximo: {maxClipDuration}s
              </span>
            </div>

            {/* Visual Bar */}
            <div className="relative mt-4 h-6 w-full overflow-hidden rounded-lg bg-muted">
              <div
                className="absolute inset-y-0 bg-brand/30 border-x-2 border-brand transition-all"
                style={{
                  left: `${Math.min(100, (minClipDuration / 180) * 100)}%`,
                  right: `${Math.max(0, 100 - (maxClipDuration / 180) * 100)}%`,
                }}
              />
              <div
                className="absolute inset-y-1 bg-brand rounded-sm opacity-80 transition-all"
                style={{
                  left: `${Math.min(100, (idealMinDuration / 180) * 100)}%`,
                  right: `${Math.max(0, 100 - (idealMaxDuration / 180) * 100)}%`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>0s</span>
              <span>60s (1 min)</span>
              <span>120s (2 min)</span>
              <span>180s (3 min)</span>
            </div>
          </div>

          {/* Granular Sliders / Inputs */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Duração Mínima do Clipe</Label>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {minClipDuration} segundos
                </span>
              </div>
              <Slider
                value={[minClipDuration]}
                min={15}
                max={120}
                step={5}
                onValueChange={(val) => {
                  const newMin = val[0];
                  handleUpdate("MIN_CLIP_DURATION", String(newMin));
                  if (newMin > maxClipDuration) {
                    handleUpdate("MAX_CLIP_DURATION", String(newMin + 30));
                  }
                  if (newMin > idealMinDuration) {
                    handleUpdate("IDEAL_CLIP_MIN_DURATION", String(newMin));
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Cortes mais curtos que este valor são expandidos automaticamente com o contexto vizinho.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Duração Máxima do Clipe</Label>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {maxClipDuration} segundos
                </span>
              </div>
              <Slider
                value={[maxClipDuration]}
                min={45}
                max={180}
                step={5}
                onValueChange={(val) => {
                  const newMax = val[0];
                  handleUpdate("MAX_CLIP_DURATION", String(newMax));
                  if (newMax < minClipDuration) {
                    handleUpdate("MIN_CLIP_DURATION", String(Math.max(15, newMax - 30)));
                  }
                  if (newMax < idealMaxDuration) {
                    handleUpdate("IDEAL_CLIP_MAX_DURATION", String(newMax));
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Teto máximo permitido para evitar cortes excessivamente longos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Limites & Performance */}
      <section className="rounded-2xl border bg-background p-6 shadow-xs">
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
              <Layers className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">4. Limites e Performance</h2>
              <p className="text-xs text-muted-foreground">
                Quantidade máxima de clipes e tempos de tolerância para processamento em lote.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Máximo de Clipes por Vídeo (MAX_CLIPS)
            </Label>
            <Input
              type="number"
              value={maxClips}
              min={1}
              max={50}
              onChange={(e) => handleUpdate("MAX_CLIPS", e.target.value)}
              className="mt-2 text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Limite superior de clipes que o analisador seleciona para corte (padrão: 10).
            </p>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Timeout Total de Análise (Segundos)
            </Label>
            <Input
              type="number"
              value={timeoutSeconds}
              min={300}
              max={14400}
              step={300}
              onChange={(e) => handleUpdate("ANALYSIS_TOTAL_TIMEOUT_SECONDS", e.target.value)}
              className="mt-2 text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Orçamento de tempo total para transcrições e rerankings longos (7200s = 2 horas).
            </p>
          </div>
        </div>
      </section>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="text-xs text-muted-foreground">
          {hasChanges ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              ● Há alterações não salvas.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <Check className="size-3.5" /> Todas as configurações estão sincronizadas.
            </span>
          )}
        </div>

        <Button
          type="submit"
          disabled={!hasChanges || isSaving || isPending}
          className="gap-2 bg-brand text-background hover:bg-brand/90 disabled:opacity-50"
        >
          {isSaving ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}
