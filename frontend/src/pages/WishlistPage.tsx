import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { WishlistItem } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, Spinner } from '../components/ui';

export function WishlistPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    api
      .get<{ items: WishlistItem[] }>('/api/v1/wishlist')
      .then((res) => setItems(res.data.items))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <div className="container section"><Spinner label="Loading wishlist…" /></div>;

  if (!user)
    return (
      <div className="container section">
        <EmptyState title="Sign in to see your wishlist" action={<Link to="/login" className="btn btn-primary">Sign in</Link>} />
      </div>
    );

  return (
    <div className="container section">
      <h1 className="page-title">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState title="Nothing saved yet" body="Tap the ♡ on any product to save it here." action={<Link to="/shop" className="btn btn-primary">Browse products</Link>} />
      ) : (
        <div className="product-grid">
          {items.map((i) => (
            <ProductCard key={i.product.id} product={i.product} />
          ))}
        </div>
      )}
    </div>
  );
}
