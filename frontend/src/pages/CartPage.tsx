import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../auth/CartContext';
import { EmptyState, QtyStepper, Spinner } from '../components/ui';
import { formatMoney } from '../lib/format';

export function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const { cart, setQuantity, removeItem, clear } = useCart();
  const navigate = useNavigate();

  if (authLoading) return <div className="container section"><Spinner label="Loading cart…" /></div>;

  if (!user) {
    return (
      <div className="container section">
        <EmptyState
          title="Sign in to view your cart"
          body="Your cart is saved to your account."
          action={<Link to="/login" className="btn btn-primary">Sign in</Link>}
        />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container section">
        <EmptyState
          title="Your cart is empty"
          body="Browse the catalog and add something you like."
          action={<Link to="/shop" className="btn btn-primary">Browse products</Link>}
        />
      </div>
    );
  }

  return (
    <div className="container section">
      <h1 className="page-title">Your cart</h1>
      <div className="cart-layout">
        <div className="cart-items">
          {cart.items.map((item) => (
            <div className="cart-item" key={`${item.productId}:${item.variantId}`}>
              {item.image ? (
                <img className="cart-item-img" src={item.image} alt={item.productName} />
              ) : (
                <div className="cart-item-img img-placeholder">📦</div>
              )}
              <div className="cart-item-info">
                <Link to={`/products/${item.productSlug}`} className="cart-item-name">
                  {item.productName}
                </Link>
                <div className="muted">
                  {Object.entries(item.attributes).map(([k, v]) => (
                    <span key={k} className="cart-attr">
                      {k}: {v}
                    </span>
                  ))}
                  <span className="cart-sku">SKU {item.sku}</span>
                </div>
                <div className="cart-item-row">
                  <QtyStepper
                    value={item.quantity}
                    max={Math.max(item.quantity, item.available)}
                    onChange={(n) => setQuantity(item.variantId, n)}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => removeItem(item.variantId)}>
                    Remove
                  </button>
                </div>
              </div>
              <div className="cart-item-total">
                {item.compareAtPriceCents && item.compareAtPriceCents > item.unitPriceCents && (
                  <s className="muted">{formatMoney(item.compareAtPriceCents)}</s>
                )}
                <strong>{formatMoney(item.lineTotalCents)}</strong>
                <span className="muted">{formatMoney(item.unitPriceCents)} each</span>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            Clear cart
          </button>
        </div>

        <aside className="summary">
          <h3>Order summary</h3>
          <div className="summary-row">
            <span>Items</span>
            <span>{cart.itemCount}</span>
          </div>
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatMoney(cart.subtotalCents)}</span>
          </div>
          <p className="muted small">
            Taxes and any coupon discount are computed at checkout.
          </p>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate('/checkout')}>
            Proceed to checkout
          </button>
        </aside>
      </div>
    </div>
  );
}
