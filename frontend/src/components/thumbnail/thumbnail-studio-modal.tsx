"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Download,
  Copy,
  Save,
  Sparkles,
  Loader2,
  Check,
  RotateCcw,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Play,
  Pause,
  AlertCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getClipUrl } from "@/lib/clip-actions";
import { WallClip } from "@/components/app/clip-wall";
import { cn } from "@/lib/utils";

export interface ThumbnailStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: WallClip | null;
  taskId: string;
  onSaved?: () => void;
}

type AspectRatio = "9:16" | "16:9" | "1:1";
type TextPosition = "top" | "center" | "bottom";
type PresetTheme = "viral_yellow" | "cyber_glow" | "alert_red" | "clean_dark";

interface PresetConfig {
  id: PresetTheme;
  name: string;
  badgeBg: string;
  textColor: string;
  strokeColor?: string;
  glowColor?: string;
  pillBg: string;
}

const PRESETS: Record<PresetTheme, PresetConfig> = {
  viral_yellow: {
    id: "viral_yellow",
    name: "Viral Impact",
    badgeBg: "#FACC15",
    textColor: "#000000",
    strokeColor: "#000000",
    pillBg: "rgba(250, 204, 21, 0.95)",
  },
  cyber_glow: {
    id: "cyber_glow",
    name: "Cyber Neon",
    badgeBg: "#06B6D4",
    textColor: "#FFFFFF",
    strokeColor: "#0891B2",
    glowColor: "#22D3EE",
    pillBg: "rgba(8, 145, 178, 0.85)",
  },
  alert_red: {
    id: "alert_red",
    name: "Alerta Máximo",
    badgeBg: "#EF4444",
    textColor: "#FFFFFF",
    strokeColor: "#991B1B",
    glowColor: "#F87171",
    pillBg: "rgba(239, 68, 68, 0.9)",
  },
  clean_dark: {
    id: "clean_dark",
    name: "Dark Glass",
    badgeBg: "#18181B",
    textColor: "#FAFAFA",
    strokeColor: "transparent",
    pillBg: "rgba(24, 24, 27, 0.85)",
  },
};

export function ThumbnailStudioModal({
  isOpen,
  onClose,
  clip,
  taskId,
  onSaved,
}: ThumbnailStudioModalProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [title, setTitle] = useState("");
  const [preset, setPreset] = useState<PresetTheme>("viral_yellow");
  const [textPosition, setTextPosition] = useState<TextPosition>("bottom");
  const [fontSizeRatio, setFontSizeRatio] = useState(54); // Base font size
  const [overlayDarkness, setOverlayDarkness] = useState(35); // 0-100%
  const [currentTime, setCurrentTime] = useState(1);
  const [duration, setDuration] = useState(10);
  const [isPlaying, setIsPlaying] = useState(false);

  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize data when clip changes
  useEffect(() => {
    if (clip) {
      setTitle(clip.hook_title || `Corte Especial #${clip.clip_order}`);
      setDuration(Math.max(1, clip.duration || 10));
      setCurrentTime(1.0);
      setAiSuggestions([]);
    }
  }, [clip]);

  // Video time scrubbing
  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const handleStep = (seconds: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + seconds));
    handleSeek(next);
  };

  // Redraw canvas whenever frame, title, or visual settings change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;

    // Dimensions based on aspect ratio
    let width = 1080;
    let height = 1920;
    if (aspectRatio === "16:9") {
      width = 1920;
      height = 1080;
    } else if (aspectRatio === "1:1") {
      width = 1080;
      height = 1080;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // 1. Draw video frame (aspect-fill)
    if (video && video.readyState >= 2) {
      const vWidth = video.videoWidth || 1080;
      const vHeight = video.videoHeight || 1920;
      const vRatio = vWidth / vHeight;
      const targetRatio = width / height;

      let drawW = width;
      let drawH = height;
      let offsetX = 0;
      let offsetY = 0;

      if (vRatio > targetRatio) {
        // Video is wider than target
        drawW = height * vRatio;
        offsetX = (width - drawW) / 2;
      } else {
        // Video is taller than target
        drawH = width / vRatio;
        offsetY = (height - drawH) / 2;
      }

      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
    } else {
      // Fallback background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#18181b");
      bgGrad.addColorStop(1, "#09090b");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Overlay gradient for readability
    if (overlayDarkness > 0) {
      const darkAlpha = overlayDarkness / 100;
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      if (textPosition === "top") {
        grad.addColorStop(0, `rgba(0, 0, 0, ${darkAlpha * 1.2})`);
        grad.addColorStop(0.4, `rgba(0, 0, 0, ${darkAlpha * 0.4})`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      } else if (textPosition === "center") {
        grad.addColorStop(0, `rgba(0, 0, 0, ${darkAlpha * 0.3})`);
        grad.addColorStop(0.5, `rgba(0, 0, 0, ${darkAlpha * 1.1})`);
        grad.addColorStop(1, `rgba(0, 0, 0, ${darkAlpha * 0.3})`);
      } else {
        // Bottom
        grad.addColorStop(0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(0.5, `rgba(0, 0, 0, ${darkAlpha * 0.4})`);
        grad.addColorStop(1, `rgba(0, 0, 0, ${darkAlpha * 1.3})`);
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 3. Render Title & Badge
    if (title.trim()) {
      const activePreset = PRESETS[preset];
      const maxTextWidth = width * 0.86;
      const computedFontSize = Math.round(fontSizeRatio * (width / 1080));

      ctx.font = `900 ${computedFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Word wrapping
      const words = title.trim().toUpperCase().split(/\s+/);
      const lines: string[] = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxTextWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = computedFontSize * 1.22;
      const totalBlockHeight = lines.length * lineHeight;

      // Determine Y anchor
      let startY = height * 0.78 - totalBlockHeight / 2;
      if (textPosition === "top") {
        startY = height * 0.18;
      } else if (textPosition === "center") {
        startY = (height - totalBlockHeight) / 2;
      }

      const paddingX = computedFontSize * 0.55;
      const paddingY = computedFontSize * 0.28;
      const cornerRadius = computedFontSize * 0.3;

      // Draw each line with styled pill badge
      lines.forEach((line, index) => {
        const lineY = startY + index * lineHeight + lineHeight / 2;
        const lineMetrics = ctx.measureText(line);
        const pillWidth = lineMetrics.width + paddingX * 2;
        const pillHeight = lineHeight - 4;
        const pillX = (width - pillWidth) / 2;
        const pillTop = lineY - pillHeight / 2;

        // Draw pill background
        ctx.save();
        ctx.fillStyle = activePreset.pillBg;

        if (activePreset.glowColor) {
          ctx.shadowColor = activePreset.glowColor;
          ctx.shadowBlur = 24;
        } else {
          ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
          ctx.shadowBlur = 12;
          ctx.shadowOffsetY = 4;
        }

        ctx.beginPath();
        ctx.roundRect(pillX, pillTop, pillWidth, pillHeight, cornerRadius);
        ctx.fill();
        ctx.restore();

        // Draw text stroke if configured
        if (activePreset.strokeColor && activePreset.strokeColor !== "transparent") {
          ctx.strokeStyle = activePreset.strokeColor;
          ctx.lineWidth = Math.max(2, Math.round(computedFontSize * 0.05));
          ctx.strokeText(line, width / 2, lineY);
        }

        // Draw text fill
        ctx.fillStyle = activePreset.textColor;
        ctx.fillText(line, width / 2, lineY);
      });
    }
  }, [aspectRatio, title, preset, textPosition, fontSizeRatio, overlayDarkness]);

  // Redraw when video frame changes or on load
  const handleVideoSeeked = () => {
    renderCanvas();
  };

  const handleVideoLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || clip?.duration || 10);
      videoRef.current.currentTime = 1.0;
    }
    renderCanvas();
  };

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Request AI Title Suggestions
  const handleGenerateAiTitles = async () => {
    if (!clip) return;
    setIsLoadingAi(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/clips/${clip.id}/suggest-titles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      if (!response.ok) {
        throw new Error("Não foi possível gerar sugestões no momento.");
      }
      const data = await response.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        setAiSuggestions(data.suggestions);
        toast.success("Sugestões virais geradas com sucesso!");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar títulos com IA");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // Save thumbnail to backend
  const handleSaveThumbnail = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !clip) return;

    setIsSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const response = await fetch(`/api/tasks/${taskId}/clips/${clip.id}/thumbnail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: dataUrl }),
      });

      if (!response.ok) {
        throw new Error("Erro ao salvar a thumbnail no servidor");
      }

      toast.success("Thumbnail salva no corte com sucesso!");
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar thumbnail");
    } finally {
      setIsSaving(false);
    }
  };

  // Download locally
  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || !clip) return;

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `thumbnail-corte-${clip.clip_order || clip.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("Download iniciado!");
  };

  // Copy to clipboard
  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setHasCopied(true);
        toast.success("Thumbnail copiada para a área de transferência!");
        setTimeout(() => setHasCopied(false), 2500);
      }, "image/png");
    } catch (err) {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  if (!clip) return null;

  const clipVideoSrc = getClipUrl(clip.video_url, clip.filename);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-hidden p-0 gap-0 border-stone-800 bg-stone-950 text-stone-100 flex flex-col md:flex-row">
        {/* Hidden video used for frame extraction */}
        <video
          ref={videoRef}
          src={clipVideoSrc}
          crossOrigin="anonymous"
          playsInline
          muted
          preload="auto"
          onSeeked={handleVideoSeeked}
          onLoadedMetadata={handleVideoLoadedMetadata}
          className="hidden"
        />

        {/* LEFT: Live Preview Stage */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-stone-900/60 border-b md:border-b-0 md:border-r border-stone-800/80 relative">
          {/* Aspect Ratio Selector bar */}
          <div className="flex items-center gap-2 mb-3 bg-stone-900 p-1 rounded-lg border border-stone-800">
            <span className="text-[11px] font-medium text-stone-400 px-2 uppercase tracking-wider">Formato:</span>
            <Button
              size="sm"
              variant={aspectRatio === "9:16" ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5"
              onClick={() => setAspectRatio("9:16")}
            >
              9:16 (Vertical)
            </Button>
            <Button
              size="sm"
              variant={aspectRatio === "16:9" ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5"
              onClick={() => setAspectRatio("16:9")}
            >
              16:9 (Horizontal)
            </Button>
            <Button
              size="sm"
              variant={aspectRatio === "1:1" ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5"
              onClick={() => setAspectRatio("1:1")}
            >
              1:1 (Quadrado)
            </Button>
          </div>

          {/* Canvas Wrapper */}
          <div
            className={cn(
              "relative rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 flex items-center justify-center bg-black transition-all",
              aspectRatio === "9:16" && "h-[min(54vh,480px)] aspect-[9/16]",
              aspectRatio === "16:9" && "w-full max-w-[460px] aspect-[16/9]",
              aspectRatio === "1:1" && "h-[min(48vh,420px)] aspect-square"
            )}
          >
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>

          {/* Frame scrubber timeline */}
          <div className="w-full max-w-md mt-4 space-y-2 bg-stone-950/80 border border-stone-800/80 p-3 rounded-xl">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span className="font-medium text-stone-200">Escolha o Frame Perfeito</span>
              <span className="font-mono tabular-nums">
                {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Slider
                value={[currentTime]}
                min={0}
                max={duration}
                step={0.1}
                onValueChange={([val]) => handleSeek(val)}
                className="flex-1"
              />
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-stone-900 border-stone-800"
                onClick={() => handleStep(-1)}
              >
                -1s
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-stone-900 border-stone-800"
                onClick={() => handleStep(-0.2)}
              >
                -0.2s
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-stone-900 border-stone-800"
                onClick={() => handleStep(0.2)}
              >
                +0.2s
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs px-2 bg-stone-900 border-stone-800"
                onClick={() => handleStep(1)}
              >
                +1s
              </Button>
            </div>
          </div>
        </div>

        {/* RIGHT: Creative Controls */}
        <div className="w-full md:w-[420px] flex flex-col max-h-[94vh] overflow-y-auto p-5 sm:p-6 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="size-4 text-brand" /> Studio de Thumbnail com IA
            </DialogTitle>
            <DialogDescription className="text-xs text-stone-400">
              Crie uma capa chamativa para reter espectadores e viralizar nas redes.
            </DialogDescription>
          </DialogHeader>

          {/* Section: Title & AI */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
                Título em Destaque
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleGenerateAiTitles}
                disabled={isLoadingAi}
                className="h-6 text-xs text-brand hover:text-brand-foreground hover:bg-brand/20 px-2 gap-1 font-medium"
              >
                {isLoadingAi ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                Sugerir com IA
              </Button>
            </div>

            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Digite o título chamativo..."
              className="bg-stone-900 border-stone-800 font-semibold text-sm"
              maxLength={80}
            />

            {/* AI suggestions pills */}
            {aiSuggestions.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[11px] font-medium text-stone-400">Ideias Virais da IA:</span>
                <div className="flex flex-col gap-1.5">
                  {aiSuggestions.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setTitle(sug)}
                      className="text-left text-xs bg-stone-900/90 hover:bg-brand/10 border border-stone-800 hover:border-brand/40 px-2.5 py-1.5 rounded-lg text-stone-200 transition-colors flex items-center justify-between group"
                    >
                      <span className="line-clamp-1">{sug}</span>
                      <Sparkles className="size-3 opacity-0 group-hover:opacity-100 text-brand transition-opacity shrink-0 ml-1.5" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: Visual Presets */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
              Estilo Visual (Presets)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(PRESETS).map((p) => {
                const isSelected = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={cn(
                      "p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between h-18",
                      isSelected
                        ? "border-brand ring-1 ring-brand bg-stone-900"
                        : "border-stone-800 bg-stone-900/40 hover:bg-stone-900 hover:border-stone-700"
                    )}
                  >
                    <span className="text-xs font-semibold text-stone-200">{p.name}</span>
                    <div className="flex items-center gap-1.5 mt-2">
                      <span
                        className="w-4 h-4 rounded-full border border-black/30"
                        style={{ backgroundColor: p.badgeBg }}
                      />
                      <span className="text-[10px] text-stone-400 uppercase font-mono">
                        {p.id.split("_")[0]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Customization sliders & position */}
          <div className="space-y-4 pt-1 border-t border-stone-800">
            {/* Position */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-400">Posição do Texto</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["top", "center", "bottom"] as TextPosition[]).map((pos) => (
                  <Button
                    key={pos}
                    type="button"
                    size="sm"
                    variant={textPosition === pos ? "secondary" : "outline"}
                    className="h-8 text-xs capitalize bg-stone-900 border-stone-800"
                    onClick={() => setTextPosition(pos)}
                  >
                    {pos === "top" ? "Superior" : pos === "center" ? "Centro" : "Inferior"}
                  </Button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Tamanho da Fonte</span>
                <span className="font-mono">{fontSizeRatio}px</span>
              </div>
              <Slider
                value={[fontSizeRatio]}
                min={36}
                max={84}
                step={2}
                onValueChange={([val]) => setFontSizeRatio(val)}
              />
            </div>

            {/* Darkening Overlay */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span>Contraste & Escurecimento</span>
                <span className="font-mono">{overlayDarkness}%</span>
              </div>
              <Slider
                value={[overlayDarkness]}
                min={0}
                max={90}
                step={5}
                onValueChange={([val]) => setOverlayDarkness(val)}
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="mt-auto pt-4 border-t border-stone-800 space-y-2">
            <Button
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90 font-semibold gap-2 shadow-lg"
              onClick={handleSaveThumbnail}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salvar Capa no Corte
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="flex-1 text-xs h-9 bg-stone-900 border-stone-800 gap-1.5"
                onClick={handleDownloadImage}
              >
                <Download className="size-3.5" /> Baixar Imagem
              </Button>
              <Button
                variant="outline"
                className="text-xs h-9 px-3 bg-stone-900 border-stone-800 gap-1.5"
                onClick={handleCopyImage}
              >
                {hasCopied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                {hasCopied ? "Copiado!" : "Copiar"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
