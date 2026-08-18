import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container section narrow">
      <h1 className="page-title">404 — Page not found</h1>
      <p className="muted">That page doesn't exist (or the product was unpublished).</p>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </div>
  );
}
