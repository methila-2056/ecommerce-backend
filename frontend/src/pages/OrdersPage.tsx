import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Order } from '../api/types';
import { EmptyState, Pagination, Spinner, StatusBadge } from '../components/ui';
import { formatDateTime, formatMoney, orderStatusLabel } from '../lib/format';

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<Order[]>(`/api/v1/orders?page=${page}&limit=10`);
        setOrders(res.data);
        setPages(res.meta?.totalPages ?? 1);
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  if (loading) return <div className="container section"><Spinner label="Loading orders…" /></div>;

  return (
    <div className="container section">
      <h1 className="page-title">My orders</h1>
      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="When you place an order it will show up here."
          action={<Link to="/shop" className="btn btn-primary">Start shopping</Link>}
        />
      ) : (
        <>
          <div className="order-list">
            {orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="order-card">
                <div>
                  <strong>#{o.orderNumber}</strong>
                  <div className="muted small">{formatDateTime(o.placedAt)}</div>
                  <div className="muted small">
                    {o.items.length} item{o.items.length === 1 ? '' : 's'} · {orderStatusLabel(o.status)}
                  </div>
                </div>
                <div className="order-card-right">
                  <StatusBadge status={o.status} />
                  <strong>{formatMoney(o.totalCents)}</strong>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={page} pages={pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
