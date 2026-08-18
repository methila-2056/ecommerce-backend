import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

export function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await api.get<Notification[]>('/api/v1/notifications?limit=50');
      setItems(res.data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  if (loading) return <div className="container section"><Spinner label="Loading notifications…" /></div>;

  if (!user)
    return (
      <div className="container section">
        <EmptyState title="Sign in to see notifications" action={<Link to="/login" className="btn btn-primary">Sign in</Link>} />
      </div>
    );

  const markRead = async (id: string) => {
    await api.post(`/api/v1/notifications/${id}/read`);
    await load();
  };

  const markAllRead = async () => {
    await api.post('/api/v1/notifications/read-all');
    await load();
  };

  return (
    <div className="container section narrow">
      <div className="order-head">
        <h1 className="page-title">Notifications</h1>
        {items.some((n) => !n.readAt) && (
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState title="You're all caught up" body="Order and review updates will appear here." />
      ) : (
        items.map((n) => (
          <article key={n.id} className={`notification ${n.readAt ? '' : 'unread'}`}>
            <div>
              <strong>{n.title}</strong>
              {!n.readAt && <span className="badge badge-good">New</span>}
              <p className="muted">{n.body}</p>
              <span className="muted small">{formatDateTime(n.createdAt)}</span>
            </div>
            {!n.readAt && (
              <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>Mark read</button>
            )}
          </article>
        ))
      )}
    </div>
  );
}
