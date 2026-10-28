import {
  Bot,
  ChartColumn,
  Film,
  type LucideIcon,
  Settings,
  Share2,
  Shield,
  Sliders,
  Sparkles,
} from "lucide-react";

export interface FeatureDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: "core" | "generation" | "publishing" | "integration" | "admin";
  match: (pathname: string) => boolean;
  mobile?: boolean;
  adminOnly?: boolean;
  socialRequired?: boolean;
  badge?: string;
}

/**
 * Central Feature Registry for SupoClip.
 * Adding a new tool, tab, or integration to SupoClip only requires adding an entry here.
 */
export const FEATURES: FeatureDefinition[] = [
  {
    id: "create",
    name: "Criar Cortes",
    label: "Criar",
    description: "Gere clipes virais a partir do YouTube ou arquivos de vídeo enviados",
    href: "/",
    icon: Sparkles,
    category: "core",
    match: (p) => p === "/",
    mobile: true,
  },
  {
    id: "library",
    name: "Biblioteca de Cortes",
    label: "Biblioteca",
    description: "Explore, visualize, exporte e gerencie seus cortes e gerações",
    href: "/list",
    icon: Film,
    category: "core",
    match: (p) => p.startsWith("/list") || p.startsWith("/tasks"),
    mobile: true,
  },
  {
    id: "generation-settings",
    name: "Configurações de Geração",
    label: "Geração",
    description: "Configure modelos de IA, transcrição Whisper, durações e limites sem reiniciar",
    href: "/settings/generation",
    icon: Sliders,
    category: "generation",
    match: (p) => p.startsWith("/settings/generation"),
    mobile: true,
    badge: "Ativo",
  },
  {
    id: "social",
    name: "Publicação Social",
    label: "Redes Sociais",
    description: "Conecte suas contas do YouTube Shorts, TikTok e Instagram Reels",
    href: "/settings/social",
    icon: Share2,
    category: "publishing",
    match: (p) => p.startsWith("/settings/social"),
    mobile: true,
    socialRequired: true,
  },
  {
    id: "analytics",
    name: "Métricas de Desempenho",
    label: "Métricas",
    description: "Acompanhe visualizações, retenção e métricas dos cortes publicados",
    href: "/analytics",
    icon: ChartColumn,
    category: "publishing",
    match: (p) => p.startsWith("/analytics"),
    mobile: true,
    socialRequired: true,
  },
  {
    id: "api-keys",
    name: "Agentes & API",
    label: "Agentes & API",
    description: "Servidor MCP (Model Context Protocol) e gerenciamento de chaves de API",
    href: "/settings/api-keys",
    icon: Bot,
    category: "integration",
    match: (p) => p.startsWith("/settings/api-keys"),
    mobile: false,
  },
  {
    id: "settings",
    name: "Configurações da Conta",
    label: "Configurações",
    description: "Estilos de legenda, fontes, notificações e plano",
    href: "/settings",
    icon: Settings,
    category: "core",
    match: (p) => p === "/settings",
    mobile: true,
  },
  {
    id: "admin",
    name: "Painel Administrativo",
    label: "Admin",
    description: "Explorador de tarefas, métricas do sistema e configurações avançadas",
    href: "/admin",
    icon: Shield,
    category: "admin",
    match: (p) => p.startsWith("/admin"),
    mobile: false,
    adminOnly: true,
  },
];

export interface NavigationFilterOptions {
  isAdmin?: boolean | null;
  hasSocialAccess?: boolean | null;
  mobileOnly?: boolean;
}

/**
 * Filter the feature registry based on the current user's session context.
 */
export function getAppNavigation(options: NavigationFilterOptions = {}) {
  const { isAdmin = false, hasSocialAccess = false, mobileOnly = false } = options;

  return FEATURES.filter((feature) => {
    if (feature.adminOnly && !isAdmin) return false;
    if (feature.socialRequired && !hasSocialAccess) return false;
    if (mobileOnly && feature.mobile === false) return false;
    return true;
  });
}
