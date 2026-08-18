import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Field } from '../components/ui';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      await api.post('/api/v1/auth/forgot-password', { email: email.trim() });
      setMsg('If that email is registered, a reset link has been sent.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section narrow">
      <h1 className="page-title">Reset password</h1>
      <form className="card form" onSubmit={submit}>
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {msg && <div className={msg.startsWith('If that email') ? 'notice notice-success' : 'notice notice-error'}>{msg}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="auth-alt">
        Remembered it? <Link to="/login">Sign in</Link>
      </p>
    </div>
  );
}
