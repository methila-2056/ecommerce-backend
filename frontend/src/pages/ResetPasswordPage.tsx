import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorNotice, Field } from '../components/ui';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/v1/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="container section narrow">
        <h1 className="page-title">Password updated</h1>
        <p className="muted">All your sessions have been signed out.</p>
        <Link to="/login" className="btn btn-primary">Sign in</Link>
      </div>
    );

  return (
    <div className="container section narrow">
      <h1 className="page-title">Set a new password</h1>
      <form className="card form" onSubmit={submit}>
        <ErrorNotice message={error} />
        <Field label="New password">
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password">
          <input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}
