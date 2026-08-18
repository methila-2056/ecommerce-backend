import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice, Field, SuccessNotice } from '../components/ui';
import { formatDate } from '../lib/format';

export function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savedMsg, setSavedMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [saving, setSaving] = useState(false);

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [changing, setChanging] = useState(false);

  if (!user)
    return (
      <div className="container section">
        <p className="muted">Please <Link to="/login">sign in</Link>.</p>
      </div>
    );

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    setProfileError('');
    try {
      await api.patch<User>('/api/v1/users/me', { name: name.trim(), phone: phone.trim() || null });
      await refreshUser();
      setSavedMsg('Profile saved.');
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChanging(true);
    setPwMsg('');
    setPwError('');
    if (next.length < 8) {
      setPwError('New password must be at least 8 characters.');
      setChanging(false);
      return;
    }
    if (next !== confirm) {
      setPwError('Passwords do not match.');
      setChanging(false);
      return;
    }
    try {
      await api.post('/api/v1/auth/change-password', { currentPassword: cur, newPassword: next });
      setPwMsg('Password changed. Other sessions were signed out.');
      setCur('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Could not change password');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="container section narrow">
      <h1 className="page-title">My account</h1>
      <div className="card">
        <h2 className="section-title">Profile</h2>
        <SuccessNotice message={savedMsg} />
        <ErrorNotice message={profileError} />
        <form className="form" onSubmit={saveProfile}>
          <Field label="Name">
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="input" disabled value={user.email} />
          </Field>
          <Field label="Phone">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
        </form>
        <p className="muted small">
          Member since {formatDate(user.createdAt)} ·{' '}
          {user.emailVerified ? 'Email verified' : 'Email not verified'}
        </p>
      </div>

      <div className="card">
        <h2 className="section-title">Change password</h2>
        <SuccessNotice message={pwMsg} />
        <ErrorNotice message={pwError} />
        <form className="form" onSubmit={changePassword}>
          <Field label="Current password">
            <input className="input" type="password" required value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password">
            <input className="input" type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={changing}>{changing ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>

      <div className="account-links">
        <Link to="/orders">My orders</Link>
        <Link to="/addresses">Address book</Link>
        <Link to="/wishlist">Wishlist</Link>
        <Link to="/notifications">Notifications</Link>
      </div>
    </div>
  );
}
