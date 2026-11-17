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
    <section className="ui-card">
      {(title || right) && (
        <header className="ui-card__header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {right && <div className="ui-card__aside">{right}</div>}
        </header>
      )}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-row">
      <span>{label}</span>
      <span className="ui-row__value mono">{children}</span>
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
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>;
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
  variant?: "primary" | "danger" | "ghost" | "secondary";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`ui-button ui-button--${variant}`}
    >
      {loading && <span className="ui-spinner" aria-hidden="true" />}
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
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {children}
      {hint && <span className="ui-field__hint">{hint}</span>}
    </label>
  );
}

export const inputClass = "ui-input mono";

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="ui-message ui-message--error" role="alert">
      <span aria-hidden="true">!</span>
      {message}
    </div>
  );
}

export function NoticeBox({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  return <div className={`ui-message ui-message--${tone}`}>{children}</div>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="ui-loading" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}
