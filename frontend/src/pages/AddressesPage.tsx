import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Address } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, ErrorNotice, Field, Spinner } from '../components/ui';

const emptyForm = {
  label: '',
  recipient: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
};

export function AddressesPage() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Address | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get<Address[]>('/api/v1/users/me/addresses');
      setAddresses(res.data);
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  if (!user)
    return (
      <div className="container section">
        <p className="muted">Please <Link to="/login">sign in</Link>.</p>
      </div>
    );
  if (loading) return <div className="container section"><Spinner label="Loading addresses…" /></div>;

  const set = (k: keyof typeof emptyForm) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const startEdit = (a: Address) => {
    setEditing(a);
    setForm({
      label: a.label,
      recipient: a.recipient,
      phone: a.phone,
      line1: a.line1,
      line2: a.line2 ?? '',
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
    });
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api.patch<Address>(`/api/v1/users/me/addresses/${editing.id}`, form);
      } else {
        await api.post<Address>('/api/v1/users/me/addresses', form);
      }
      setForm(emptyForm);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save address');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/api/v1/users/me/addresses/${id}`);
    await load();
  };

  const setDefault = async (id: string) => {
    await api.post(`/api/v1/users/me/addresses/${id}/default`);
    await load();
  };

  return (
    <div className="container section">
      <h1 className="page-title">Address book</h1>
      <ErrorNotice message={error} />

      <div className="checkout-layout">
        <div className="checkout-main">
          {addresses.length === 0 ? (
            <EmptyState title="No addresses saved" body="Add an address to speed up checkout." />
          ) : (
            addresses.map((a) => (
              <div key={a.id} className="card address-card">
                <div>
                  <strong>
                    {a.label} {a.isDefault && <span className="badge badge-good">Default</span>}
                  </strong>
                  <p>
                    {a.recipient} · {a.phone}
                    <br />
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}
                    <br />
                    {a.city}, {a.state} {a.postalCode} · {a.country}
                  </p>
                </div>
                <div className="address-actions">
                  {!a.isDefault && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setDefault(a.id)}>Set default</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(a)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(a.id)}>Remove</button>
                </div>
              </div>
            ))
          )}
        </div>

        <form className="summary" onSubmit={submit}>
          <h3>{editing ? 'Edit address' : 'Add an address'}</h3>
          <div className="grid-2">
            <Field label="Label">
              <input className="input" required maxLength={50} value={form.label} onChange={set('label')} placeholder="Home" />
            </Field>
            <Field label="Recipient">
              <input className="input" required maxLength={100} value={form.recipient} onChange={set('recipient')} />
            </Field>
            <Field label="Phone">
              <input className="input" maxLength={30} value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Line 1">
              <input className="input" required maxLength={200} value={form.line1} onChange={set('line1')} />
            </Field>
            <Field label="Line 2 (optional)">
              <input className="input" maxLength={200} value={form.line2} onChange={set('line2')} />
            </Field>
            <Field label="City">
              <input className="input" required maxLength={100} value={form.city} onChange={set('city')} />
            </Field>
            <Field label="State">
              <input className="input" required maxLength={100} value={form.state} onChange={set('state')} />
            </Field>
            <Field label="Postal code">
              <input className="input" required maxLength={20} value={form.postalCode} onChange={set('postalCode')} />
            </Field>
            <Field label="Country">
              <input className="input" required minLength={2} maxLength={2} value={form.country} onChange={set('country')} />
            </Field>
          </div>
          <div className="section-actions">
            {editing && (
              <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(emptyForm); }}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add address'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
