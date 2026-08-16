import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice, Field } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/';
  const registered = params.get('registered') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section narrow">
      <h1 className="page-title">Sign in</h1>
      <form className="card form" onSubmit={submit}>
        {registered && (
          <div className="notice notice-success" role="status">
            Account created — you can sign in now.
          </div>
        )}
        <ErrorNotice message={error} />
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="muted small">Demo account: <code>demo@demo.com</code> / <code>Demo123!</code></p>
      </form>
      <p className="auth-alt">
        No account? <Link to="/register">Create one</Link> ·{' '}
        <Link to="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  );
}
