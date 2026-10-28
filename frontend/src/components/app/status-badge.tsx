import { cn } from "@/lib/utils";

export const ACTIVE_TASK_STATUSES = ["queued", "processing"];
export const RESUMABLE_TASK_STATUSES = ["cancelled", "error"];
const styles: Record<string, [string, string]> = {
  completed: ["Concluído", "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"],
  processing: ["Processando", "bg-sky-500/10 text-sky-700 dark:text-sky-400"],
  queued: ["Na fila", "bg-amber-500/10 text-amber-700 dark:text-amber-400"],
  error: ["Falhou", "bg-red-500/10 text-red-700 dark:text-red-400"],
  cancelled: ["Cancelado", "bg-stone-500/10 text-stone-600 dark:text-stone-400"],
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const [label, style] = styles[status] ?? [status, "bg-muted text-muted-foreground"];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", style, className)}>
    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "processing" && "motion-safe:animate-pulse")} />
    {label}
  </span>;
}
