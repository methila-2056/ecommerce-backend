import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Address, Order, Payment } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../auth/CartContext';
import { EmptyState, ErrorNotice, Field, Spinner } from '../components/ui';
import { formatMoney } from '../lib/format';

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, refresh } = useCart();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [savedAddressId, setSavedAddressId] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponMsg, setCouponMsg] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  const [manual, setManual] = useState({
    fullName: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });

  useEffect(() => {
    if (!user) return;
    api
      .get<Address[]>('/api/v1/users/me/addresses')
      .then((res) => {
        setAddresses(res.data);
        const def = res.data.find((a) => a.isDefault) ?? res.data[0];
        if (def) setSavedAddressId(def.id);
      })
      .catch(() => setAddresses([]));
  }, [user]);

  if (authLoading) return <div className="container section"><Spinner label="Loading checkout…" /></div>;

  if (!user) {
    return (
      <div className="container section">
        <EmptyState
          title="Sign in to check out"
          body="You'll need an account to place an order."
          action={<Link to="/login?next=/checkout" className="btn btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Nothing to check out"
          body="Your cart is empty."
          action={<Link to="/shop" className="btn btn-primary">Browse products</Link>}
        />
      </div>
    );
  }

  const validateCoupon = async () => {
    setCouponMsg('');
    const code = coupon.trim();
    if (!code || !cart) return;
    try {
      const items = cart.items.map((i) => ({
        productId: i.productId,
        category: undefined,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      }));
      const res = await api.post<{ valid: boolean; discountCents: number; message: string }>(
        `/api/v1/coupons/validate/${encodeURIComponent(code)}`,
        { items },
      );
      setCouponMsg(
        res.data.valid
          ? `✓ ${res.data.message ?? 'Coupon valid'} (${formatMoney(res.data.discountCents)})`
          : res.data.message || 'Coupon not applicable',
      );
    } catch (e) {
      setCouponMsg(e instanceof ApiError ? e.message : 'Could not validate coupon');
    }
  };

  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setPlacing(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      if (savedAddressId && addresses.length > 0 && !manual.fullName) {
        body.shippingAddressId = savedAddressId;
      } else {
        body.shippingAddress = manual;
      }
      if (coupon.trim()) body.couponCode = coupon.trim();

      const orderRes = await api.post<Order>('/api/v1/orders', body);
      const order = orderRes.data;

      const payRes = await api.post<{ payment: Payment; order: Order }>('/api/v1/payments/checkout', {
        orderId: order.id,
        provider: 'mock',
      });

      await refresh();
      navigate(`/orders/${payRes.data.order.id}?paid=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not place order');
      setPlacing(false);
    }
  };

  return (
    <div className="container section">
      <h1 className="page-title">Checkout</h1>
      <form className="checkout-layout" onSubmit={placeOrder}>
        <div className="checkout-main">
          <ErrorNotice message={error} />

          <section>
            <h2 className="section-title">Shipping address</h2>
            {addresses.length > 0 && (
              <label className="field">
                <span className="field-label">Saved address</span>
                <select
                  value={savedAddressId}
                  onChange={(e) => {
                    setSavedAddressId(e.target.value);
                    setManual({ ...manual, fullName: '' });
                  }}
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}: {a.recipient}, {a.line1}, {a.city} {a.postalCode}
                    </option>
                  ))}
                  <option value="">+ Enter a new address below</option>
                </select>
              </label>
            )}
            <div className="grid-2">
              <Field label="Full name">
                <input
                  className="input"
                  required
                  value={manual.fullName}
                  onChange={(e) => setManual({ ...manual, fullName: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="input"
                  required
                  value={manual.phone}
                  onChange={(e) => setManual({ ...manual, phone: e.target.value })}
                />
              </Field>
              <Field label="Address line 1">
                <input
                  className="input"
                  required
                  value={manual.line1}
                  onChange={(e) => setManual({ ...manual, line1: e.target.value })}
                />
              </Field>
              <Field label="Address line 2 (optional)">
                <input
                  className="input"
                  value={manual.line2}
                  onChange={(e) => setManual({ ...manual, line2: e.target.value })}
                />
              </Field>
              <Field label="City">
                <input
                  className="input"
                  required
                  value={manual.city}
                  onChange={(e) => setManual({ ...manual, city: e.target.value })}
                />
              </Field>
              <Field label="State / Province">
                <input
                  className="input"
                  required
                  value={manual.state}
                  onChange={(e) => setManual({ ...manual, state: e.target.value })}
                />
              </Field>
              <Field label="Postal code">
                <input
                  className="input"
                  required
                  value={manual.postalCode}
                  onChange={(e) => setManual({ ...manual, postalCode: e.target.value })}
                />
              </Field>
              <Field label="Country (2-letter)">
                <input
                  className="input"
                  required
                  minLength={2}
                  maxLength={2}
                  value={manual.country}
                  onChange={(e) => setManual({ ...manual, country: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
          </section>

          <section>
            <h2 className="section-title">Coupon</h2>
            <div className="coupon-row">
              <input
                className="input"
                placeholder="Promo code (try WELCOME10)"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
              />
              <button type="button" className="btn btn-ghost" onClick={validateCoupon}>
                Apply
              </button>
            </div>
            {couponMsg && <p className={couponMsg.startsWith('✓') ? 'notice notice-success' : 'notice notice-error'}>{couponMsg}</p>}
          </section>
        </div>

        <aside className="summary">
          <h3>Order summary</h3>
          {cart.items.map((item) => (
            <div key={`${item.productId}:${item.variantId}`} className="summary-line">
              <span>
                {item.productName} × {item.quantity}
              </span>
              <span>{formatMoney(item.lineTotalCents)}</span>
            </div>
          ))}
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(cart.subtotalCents)}</span>
          </div>
          <p className="muted small">
            Tax is included per line item. Shipping is calculated at order time.
          </p>
          <button className="btn btn-primary btn-lg btn-block" disabled={placing}>
            {placing ? 'Placing order…' : `Place order · ${formatMoney(cart.subtotalCents)}`}
          </button>
          <p className="muted small">
            Payments use the built-in <strong>mock</strong> provider and are auto-approved in this demo.
          </p>
        </aside>
      </form>
    </div>
  );
}
