import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { EmptyState } from '../components/ui';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'checking' | 'ok' | 'error'>('checking');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMsg('Missing verification token.');
      return;
    }
    api
      .post(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState('ok'))
      .catch((e) => {
        setState('error');
        setMsg(e instanceof Error ? e.message : 'Verification failed');
      });
  }, [token]);

  if (state === 'checking') return <div className="container section"><p className="muted">Verifying your email…</p></div>;
  if (state === 'ok')
    return (
      <div className="container section narrow">
        <EmptyState
          title="Email verified!"
          body="You can now place orders and leave reviews."
          action={<Link to="/login" className="btn btn-primary">Sign in</Link>}
        />
      </div>
    );
  return (
    <div className="container section narrow">
      <EmptyState
        title="Verification failed"
        body={msg}
        action={<Link to="/" className="btn btn-primary">Go home</Link>}
      />
    </div>
  );
}
