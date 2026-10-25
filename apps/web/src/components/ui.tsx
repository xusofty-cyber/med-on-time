import { ReactNode, useEffect } from 'react';
import { actions, useApp } from '../lib/store';

/* 基础组件：类名走 index.css 的组件层，关怀模式下自动放大点击区与字号。 */

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'soft' | 'success';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const v = props.variant ?? 'primary';
  const cls =
    v === 'primary'
      ? 'btn btn-primary'
      : v === 'danger'
        ? 'btn btn-danger'
        : v === 'soft'
          ? 'btn btn-soft'
          : v === 'success'
            ? 'btn btn-success'
            : 'btn btn-ghost';
  return (
    <button
      type={props.type ?? 'button'}
      className={`${cls} ${props.className ?? ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-sm text-neutral-500">{props.hint}</span>}
    </label>
  );
}

export function TextInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <input
      className="input"
      value={props.value}
      type={props.type ?? 'text'}
      placeholder={props.placeholder}
      required={props.required}
      autoComplete={props.autoComplete}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function Select(props: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select className="input" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Card(props: { children: ReactNode; className?: string; title?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`}>
      {props.title && <h2 className="card-title">{props.title}</h2>}
      {props.children}
    </section>
  );
}

export function Badge(props: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'gray' | 'blue' }) {
  const tone = props.tone ?? 'gray';
  const cls = {
    green: 'badge badge-success',
    amber: 'badge badge-warning',
    red: 'badge badge-danger',
    gray: 'badge badge-neutral',
    blue: 'badge badge-info',
  }[tone];
  return <span className={cls}>{props.children}</span>;
}

export function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-neutral-500" role="status">
      <span className="spinner" aria-hidden />
      <span>{text ?? '加载中…'}</span>
    </div>
  );
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="py-10 text-center text-neutral-500">
      <p>{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.open, props.onClose]);
  if (!props.open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={props.title} onClick={props.onClose}>
      <div
        className={`modal-panel ${props.wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-medgreen-dark">{props.title}</h2>
          <button className="btn-icon" onClick={props.onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind === 'error' ? 'toast-error' : t.kind === 'success' ? 'toast-success' : 'toast-info'}`}
          role="alert"
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const text = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl bg-red-50 px-4 py-3 text-red-700" role="alert">
      {text}
    </div>
  );
}

export { actions };
