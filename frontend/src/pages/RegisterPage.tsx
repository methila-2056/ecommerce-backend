import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice, Field } from '../components/ui';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
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
      await register(name.trim(), email.trim(), password);
      navigate('/login?registered=1', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section narrow">
      <h1 className="page-title">Create an account</h1>
      <form className="card form" onSubmit={submit}>
        <ErrorNotice message={error} />
        <Field label="Full name">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="auth-alt">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
