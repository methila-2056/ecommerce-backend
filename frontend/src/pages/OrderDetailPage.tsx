import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Order } from '../api/types';
import { EmptyState, ErrorNotice, Spinner, StatusBadge } from '../components/ui';
import { formatMoney, formatDateTime, orderStatusLabel } from '../lib/format';

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const paid = params.get('paid') === '1';

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelMsg, setCancelMsg] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    api
      .get<Order>(`/api/v1/orders/${orderId}`)
      .then((res) => setOrder(res.data))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load order'));
  }, [orderId]);

  if (error) {
    return (
      <div className="container section">
        <EmptyState
          title="Order not found"
          body={error}
          action={<Link to="/orders" className="btn btn-primary">Back to my orders</Link>}
        />
      </div>
    );
  }
  if (!order) return <div className="container section"><Spinner label="Loading order…" /></div>;

  const cancel = async () => {
    setWorking(true);
    setCancelMsg('');
    try {
      const res = await api.post<Order>(`/api/v1/orders/${order.id}/cancel`, {
        reason: cancelReason || 'Customer request',
      });
      setOrder(res.data);
      setCancelMsg('Order cancelled.');
    } catch (e) {
      setCancelMsg(e instanceof ApiError ? e.message : 'Could not cancel order');
    } finally {
      setWorking(false);
    }
  };

  const canCancel = ['pending', 'confirmed'].includes(order.status);

  return (
    <div className="container section narrow">
      {paid && (
        <div className="success-hero">
          <div className="success-icon">✓</div>
          <h1 className="page-title">Payment successful</h1>
          <p className="muted">Your order was confirmed by the mock payment provider.</p>
        </div>
      )}

      <div className="order-head">
        <div>
          <h1 className="page-title">Order {order.orderNumber}</h1>
          <p className="muted">
            Placed {formatDateTime(order.placedAt)} · Payment {order.paymentStatus ?? '—'}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <ErrorNotice message={cancelMsg} />

      <div className="card">
        <h2 className="section-title">Items</h2>
        {order.items.map((item) => (
          <div key={`${item.productId}:${item.variantId}`} className="summary-line">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatMoney(item.lineTotalCents)}</span>
          </div>
        ))}
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatMoney(order.subtotalCents)}</span>
        </div>
        {order.couponCode && (
          <div className="summary-row">
            <span>Coupon {order.couponCode}</span>
            <span>−{formatMoney(order.couponDiscountCents)}</span>
          </div>
        )}
        <div className="summary-row">
          <span>Tax</span>
          <span>{formatMoney(order.taxTotalCents)}</span>
        </div>
        <div className="summary-row">
          <span>Shipping</span>
          <span>{formatMoney(order.shippingCents)}</span>
        </div>
        <div className="summary-row strong">
          <span>Total</span>
          <span>{formatMoney(order.totalCents)}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="section-title">Shipping address</h2>
        <p>
          {order.shippingAddress.fullName}
          <br />
          {order.shippingAddress.line1}
          {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
          <br />
          {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
          <br />
          {order.shippingAddress.country}
          {order.shippingAddress.phone && <> · {order.shippingAddress.phone}</>}
        </p>
      </div>

      {order.statusHistory.length > 0 && (
        <div className="card">
          <h2 className="section-title">Status history</h2>
          <ul className="timeline">
            {[...order.statusHistory].reverse().map((h, i) => (
              <li key={i}>
                <div className="timeline-dot" />
                <div>
                  <strong>{orderStatusLabel(h.status)}</strong>{' '}
                  <span className="muted">{formatDateTime(h.at)}</span>
                  {h.note && <p className="muted small">{h.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canCancel && (
        <div className="card">
          <h2 className="section-title">Cancel order</h2>
          <input
            className="input"
            placeholder="Reason (optional)"
            value={cancelReason}
            maxLength={500}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <button className="btn btn-danger" disabled={working} onClick={cancel}>
            {working ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      )}

      <div className="section-actions">
        <Link to="/orders" className="btn btn-ghost">All orders</Link>
        <Link to="/shop" className="btn btn-ghost">Continue shopping</Link>
      </div>
    </div>
  );
}
