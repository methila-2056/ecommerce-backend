import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { formatMoney } from '../lib/format';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  if (!message) return null;
  return <div className="notice notice-error" role="alert">{message}</div>;
}

export function SuccessNotice({ message }: { message: string }) {
  if (!message) return null;
  return <div className="notice notice-success" role="status">{message}</div>;
}

export function Stars({ rating }: { rating: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  return (
    <span className="stars" title={`${rating.toFixed(1)} / 5`}>
      <span className="stars-bg" aria-hidden="true">★★★★★</span>
      <span className="stars-fill" style={{ width: `${pct}%` }} aria-hidden="true">★★★★★</span>
      <span className="sr-only">{rating.toFixed(1)} out of 5 stars</span>
    </span>
  );
}

export function Price({
  priceCents,
  compareAtPriceCents,
  size = 'md',
}: {
  priceCents: number | null | undefined;
  compareAtPriceCents?: number | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <span className={`price price-${size}`}>
      <span className="price-now">{formatMoney(priceCents)}</span>
      {compareAtPriceCents && compareAtPriceCents > (priceCents ?? 0) && (
        <s className="price-was">{formatMoney(compareAtPriceCents)}</s>
      )}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active' || status === 'confirmed' || status === 'delivered' || status === 'shipped'
      ? 'good'
      : status === 'cancelled' || status === 'blocked' || status === 'payment_failed' || status === 'inactive'
        ? 'bad'
        : status === 'pending' || status === 'processing' || status === 'packed' || status === 'refund_requested'
          ? 'warn'
          : 'muted';
  return <span className={`badge badge-${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <span className="qty">
      <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      />
      <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

export function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (p: number) => void;
}) {
  if (pages <= 1) return null;
  const nums: number[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
  }
  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) items.push('gap');
    items.push(n);
    prev = n;
  }
  return (
    <nav className="pagination" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      {items.map((it, i) =>
        it === 'gap' ? (
          <span key={`g${i}`} className="page-gap">…</span>
        ) : (
          <button key={it} className={it === page ? 'page-current' : ''} onClick={() => onChange(it)}>
            {it}
          </button>
        ),
      )}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>Next →</button>
    </nav>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="section-link" to={to}>
      {children} →
    </Link>
  );
}
