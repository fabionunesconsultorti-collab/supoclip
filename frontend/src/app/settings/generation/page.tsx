import Link from "next/link";
import { headers } from "next/headers";
import { ChevronLeft, Sliders, Zap } from "lucide-react";

import { auth } from "@/lib/auth";
import { fetchBackend } from "@/server/backend-api";
import { GenerationSettingsForm } from "@/components/settings/generation-settings-form";
import type { RuntimeSetting } from "@/components/admin/runtime-settings-form";

export const dynamic = "force-dynamic";

export default async function GenerationSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">Login Necessário</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Faça login para acessar e personalizar os parâmetros de geração.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Ir para o login
        </Link>
      </main>
    );
  }

  let settings: RuntimeSetting[] = [];
  try {
    const response = await fetchBackend("/admin/runtime-settings", {
      method: "GET",
      userId: session.user.id,
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as { settings?: RuntimeSetting[] };
      settings = payload.settings || [];
    }
  } catch (error) {
    console.error("Failed to load generation settings from backend:", error);
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8 md:py-10">
      {/* Breadcrumb / Back Link */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Voltar para Settings
      </Link>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-3xl font-bold tracking-tight">Configurações de Geração</h1>
            <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
              <Zap className="size-3" /> Zero Restart
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ajuste modelos de inteligência artificial (Gemini/Ollama), motor de transcrição Whisper,
            e durações mínima e máxima de cortes em tempo real.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <GenerationSettingsForm settings={settings} />
      </div>
    </main>
  );
}
