// Shared UI primitives.
import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  right,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-lg shadow-black/20">
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800/60 py-2 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="mono text-right text-sm break-all text-zinc-200">{children}</span>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "green" | "amber" | "red" | "blue";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-zinc-800 text-zinc-300 border-zinc-700",
    green: "bg-emerald-950 text-emerald-300 border-emerald-800",
    amber: "bg-amber-950 text-amber-300 border-amber-800",
    red: "bg-red-950 text-red-300 border-red-800",
    blue: "bg-sky-950 text-sky-300 border-sky-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  loading,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
  loading?: boolean;
}) {
  const variants: Record<string, string> = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500",
    danger: "bg-red-600 hover:bg-red-500 text-white border-red-500",
    ghost: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]}`}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "mono w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-600";

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">
      {message}
    </div>
  );
}

export function NoticeBox({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  const tones = {
    blue: "border-sky-900 bg-sky-950/60 text-sky-300",
    amber: "border-amber-900 bg-amber-950/60 text-amber-300",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
      {label}…
    </div>
  );
}
