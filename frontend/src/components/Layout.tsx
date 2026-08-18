import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../auth/CartContext';

function Header() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const itemCount = cart?.itemCount ?? 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/shop?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">🛒</span>
          <span className="brand-name">Nova<span>Shop</span></span>
        </Link>

        <form className="search" onSubmit={onSubmit} role="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>

        <nav className="nav" aria-label="Primary">
          <NavLink to="/shop">Shop</NavLink>
          <NavLink to="/wishlist">Wishlist</NavLink>
          <Link to="/cart" className="nav-cart" aria-label={`Cart, ${itemCount} items`}>
            Cart
            {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
          </Link>

          {user ? (
            <div className="menu">
              <button
                type="button"
                className="menu-toggle"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
              >
                {user.name || user.email} ▾
              </button>
              {menuOpen && (
                <div className="menu-drop">
                  <Link to="/account" onClick={() => setMenuOpen(false)}>My Account</Link>
                  <Link to="/orders" onClick={() => setMenuOpen(false)}>My Orders</Link>
                  <Link to="/notifications" onClick={() => setMenuOpen(false)}>Notifications</Link>
                  <Link to="/addresses" onClick={() => setMenuOpen(false)}>Addresses</Link>
                  <button
                    type="button"
                    className="menu-logout"
                    onClick={async () => {
                      setMenuOpen(false);
                      await logout();
                      navigate('/');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink to="/login" className="btn btn-primary btn-sm">
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <div className="brand-name footer-brand">Nova<span>Shop</span></div>
          <p className="muted">A full-stack demo storefront running against the E-Commerce Backend System.</p>
        </div>
        <div className="footer-cols">
          <div>
            <h4>Shop</h4>
            <Link to="/shop">All products</Link>
            <Link to="/shop?sort=rating">Top rated</Link>
            <Link to="/shop?inStock=true">In stock</Link>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/login">Sign in</Link>
            <Link to="/register">Register</Link>
            <Link to="/orders">My orders</Link>
          </div>
        </div>
      </div>
      <div className="container footer-bottom muted">
        Demo environment — payments are simulated and no real money moves. Try it: demo@demo.com / Demo123!
      </div>
    </footer>
  );
}

export function Layout() {
  const { loading } = useAuth();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="app">
      <Header />
      <main className="main">
        {loading ? <div className="container page-loading">Loading…</div> : <Outlet />}
      </main>
      <Footer />
    </div>
  );
}
