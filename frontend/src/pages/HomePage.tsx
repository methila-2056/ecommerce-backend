import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Category, Product } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { ErrorNotice, Spinner } from '../components/ui';

export function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [p, c] = await Promise.all([
          api.get<Product[]>('/api/v1/products?limit=8&sort=rating'),
          api.get<Category[]>('/api/v1/categories'),
        ]);
        setProducts(p.data);
        setCategories(c.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load storefront');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Spinner label="Loading storefront…" />;

  return (
    <div>
      <section className="hero">
        <div className="container hero-inner">
          <div className="hero-text">
            <p className="hero-kicker">E-Commerce Backend System · Live demo</p>
            <h1>Everything you need, delivered.</h1>
            <p>
              Browse the seeded catalog, order with the mock payment provider, and follow orders
              through every state — inventory, coupons, reviews and wishlists all live.
            </p>
            <div className="hero-actions">
              <Link to="/shop" className="btn btn-primary btn-lg">Shop now</Link>
              <Link to="/register" className="btn btn-ghost btn-lg">Create an account</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">🛍️</div>
        </div>
      </section>

      <ErrorNotice message={error} />

      {categories.length > 0 && (
        <section className="container section">
          <h2 className="section-title">Browse by category</h2>
          <div className="category-chips">
            {categories.map((c) => (
              <Link key={c.id} to={`/shop?category=${encodeURIComponent(c.slug)}`} className="chip">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container section">
        <div className="section-head">
          <h2 className="section-title">Featured products</h2>
          <Link to="/shop" className="section-link">View all →</Link>
        </div>
        {products.length === 0 ? (
          <p className="muted">No products published yet.</p>
        ) : (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      <section className="container section perks">
        <div className="perk"><span>🚚</span><div><h4>Fast fulfillment</h4><p>Stock is reserved atomically at order time.</p></div></div>
        <div className="perk"><span>💳</span><div><h4>Mock payments</h4><p>Checkout with the built-in provider — no real charges.</p></div></div>
        <div className="perk"><span>🛡️</span><div><h4>Secure auth</h4><p>JWT access + rotating refresh tokens via httpOnly cookies.</p></div></div>
      </section>
    </div>
  );
}
