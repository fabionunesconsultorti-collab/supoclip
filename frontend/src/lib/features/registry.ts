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
    name: "Create Clips",
    label: "Create",
    description: "Generate viral clips from YouTube or uploaded video files",
    href: "/",
    icon: Sparkles,
    category: "core",
    match: (p) => p === "/",
    mobile: true,
  },
  {
    id: "library",
    name: "Clip Library",
    label: "Library",
    description: "Browse, view, export, and manage your generated clips and tasks",
    href: "/list",
    icon: Film,
    category: "core",
    match: (p) => p.startsWith("/list") || p.startsWith("/tasks"),
    mobile: true,
  },
  {
    id: "generation-settings",
    name: "Generation Settings",
    label: "Generation",
    description: "Configure AI models, Whisper transcription, clip durations, and timeouts without restarting",
    href: "/settings/generation",
    icon: Sliders,
    category: "generation",
    match: (p) => p.startsWith("/settings/generation"),
    mobile: true,
    badge: "Live",
  },
  {
    id: "social",
    name: "Social Publishing",
    label: "Social",
    description: "Connect YouTube Shorts, TikTok, and Instagram Reels accounts",
    href: "/settings/social",
    icon: Share2,
    category: "publishing",
    match: (p) => p.startsWith("/settings/social"),
    mobile: true,
    socialRequired: true,
  },
  {
    id: "analytics",
    name: "Performance Analytics",
    label: "Analytics",
    description: "Track views, audience retention, and performance metrics across published clips",
    href: "/analytics",
    icon: ChartColumn,
    category: "publishing",
    match: (p) => p.startsWith("/analytics"),
    mobile: true,
    socialRequired: true,
  },
  {
    id: "api-keys",
    name: "Agents & API",
    label: "Agents & API",
    description: "Model Context Protocol (MCP) server endpoints and API key management",
    href: "/settings/api-keys",
    icon: Bot,
    category: "integration",
    match: (p) => p.startsWith("/settings/api-keys"),
    mobile: false,
  },
  {
    id: "settings",
    name: "User Settings",
    label: "Settings",
    description: "Caption styles, fonts, notifications, and subscription plan",
    href: "/settings",
    icon: Settings,
    category: "core",
    match: (p) => p === "/settings",
    mobile: true,
  },
  {
    id: "admin",
    name: "Admin Center",
    label: "Admin",
    description: "User task explorer, system metrics, and advanced configurations",
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
