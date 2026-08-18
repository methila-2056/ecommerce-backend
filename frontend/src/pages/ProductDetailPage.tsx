import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Product, Review } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useCart } from '../auth/CartContext';
import { EmptyState, ErrorNotice, Price, QtyStepper, Spinner, Stars } from '../components/ui';
import { formatDate } from '../lib/format';

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addMsg, setAddMsg] = useState('');
  const [inWishlist, setInWishlist] = useState(false);
  const [mainImage, setMainImage] = useState('');

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPages, setReviewPages] = useState(1);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<Product>(`/api/v1/products/slug/${slug}`);
        setProduct(res.data);
        const active = res.data.variants.filter((v) => v.isActive && v.inStock !== false);
        setSelectedVariant(active[0]?.id || res.data.variants[0]?.id || '');
        const images = Array.from(
          new Set([...(res.data.images ?? []), ...res.data.variants.flatMap((v) => v.images ?? [])]),
        );
        setMainImage(images[0] ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Product not found');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!product) return;
    (async () => {
      try {
        const res = await api.get<Review[]>(
          `/api/v1/products/${product.id}/reviews?page=${reviewPage}&limit=10`,
        );
        setReviews(res.data);
        setReviewPages(res.meta?.totalPages ?? 1);
      } catch {
        setReviews([]);
      }
    })();
  }, [product, reviewPage]);

  useEffect(() => {
    if (!user || !product) return;
    (async () => {
      try {
        const res = await api.get<{ items: { productId: string }[] }>('/api/v1/wishlist');
        setInWishlist(res.data.items.some((i) => i.productId === product.id));
      } catch {
        // not authed — ignore
      }
    })();
  }, [user, product]);

  const images = useMemo(() => {
    if (!product) return [];
    return Array.from(new Set([...(product.images ?? []), ...product.variants.flatMap((v) => v.images ?? [])]));
  }, [product]);

  const variant = useMemo(
    () => product?.variants.find((v) => v.id === selectedVariant) ?? null,
    [product, selectedVariant],
  );

  if (loading) return <div className="container section"><Spinner label="Loading product…" /></div>;
  if (error || !product)
    return (
      <div className="container section">
        <EmptyState
          title="Product not found"
          body={error || 'This product may be unpublished.'}
          action={<Link to="/shop" className="btn btn-primary">Back to shop</Link>}
        />
      </div>
    );

  const handleAdd = async () => {
    if (!user) {
      navigate(`/login?next=/products/${product.slug}`);
      return;
    }
    if (!variant) {
      setAddMsg('Please choose a variant.');
      return;
    }
    setAdding(true);
    setAddMsg('');
    setAdded(false);
    try {
      await addItem(product.id, variant.id, qty);
      setAdded(true);
      setAddMsg(`Added ${qty} × ${variant.attributes?.option ?? 'option'} to cart.`);
    } catch (e) {
      setAddMsg(e instanceof ApiError ? e.message : 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  };

  const toggleWishlist = async () => {
    if (!user) {
      navigate(`/login?next=/products/${product.slug}`);
      return;
    }
    try {
      if (inWishlist) {
        await api.delete(`/api/v1/wishlist/${product.id}`);
        setInWishlist(false);
      } else {
        await api.post(`/api/v1/wishlist/${product.id}`);
        setInWishlist(true);
      }
    } catch {
      // ignore
    }
  };

  const submitReview = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    setReviewError('');
    setReviewMsg('');
    try {
      await api.post<Review>(`/api/v1/products/${product.id}/reviews`, {
        rating: reviewRating,
        title: reviewTitle,
        body: reviewBody,
      });
      setReviewMsg('Thanks! Your review was submitted.');
      setReviewTitle('');
      setReviewBody('');
      setReviewRating(5);
      const res = await api.get<Review[]>(`/api/v1/products/${product.id}/reviews?page=1&limit=10`);
      setReviews(res.data);
      setReviewPages(res.meta?.totalPages ?? 1);
    } catch (e) {
      setReviewError(e instanceof ApiError ? e.message : 'Could not submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="container section">
      <nav className="breadcrumbs muted">
        <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / <span>{product.name}</span>
      </nav>

      <div className="product-detail">
        <div className="product-gallery">
          {mainImage ? (
            <div className="gallery-main">
              <img src={mainImage} alt={product.name} />
            </div>
          ) : (
            <div className="gallery-main img-placeholder">📦</div>
          )}
          {images.length > 1 && (
            <div className="gallery-thumbs">
              {images.map((img) => (
                <button
                  key={img}
                  type="button"
                  className={img === mainImage ? 'thumb active' : 'thumb'}
                  onClick={() => setMainImage(img)}
                >
                  <img src={img} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info">
          <div className="product-meta">
            {product.brand && <span className="chip">{product.brand}</span>}
            <Stars rating={product.averageRating} />{' '}
            <span className="muted">
              ({product.ratingCount} review{product.ratingCount === 1 ? '' : 's'})
            </span>
          </div>
          <h1 className="product-title">{product.name}</h1>
          <p className="product-summary">{product.summary}</p>

          <div className="product-price">
            <Price
              priceCents={variant?.priceCents ?? product.minPriceCents}
              compareAtPriceCents={variant?.compareAtPriceCents}
              size="lg"
            />
          </div>

          {product.variants.length > 1 && (
            <div className="variant-picker">
              <span className="field-label">Options</span>
              <div className="variant-options">
                {product.variants.map((v) => {
                  const label = v.attributes?.option ?? v.attributes?.size ?? v.attributes?.color ?? v.sku;
                  const disabled = !v.isActive || v.inStock === false;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      className={`variant-opt ${v.id === selectedVariant ? 'active' : ''}`}
                      disabled={disabled}
                      onClick={() => setSelectedVariant(v.id)}
                    >
                      {label}
                      {!disabled && <small>{((v.priceCents ?? 0) / 100).toFixed(2)}</small>}
                      {disabled && <small>sold out</small>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="buy-row">
            <QtyStepper value={qty} onChange={setQty} />
            <button className="btn btn-primary btn-lg" onClick={handleAdd} disabled={adding || !variant}>
              {adding ? 'Adding…' : added ? '✓ Added' : 'Add to cart'}
            </button>
            <button className="btn btn-ghost btn-lg" onClick={toggleWishlist} aria-pressed={inWishlist}>
              {inWishlist ? '♥ In wishlist' : '♡ Wishlist'}
            </button>
          </div>
          {addMsg && <ErrorNotice message={addMsg} />}
          {!variant && <p className="muted">This product is currently sold out.</p>}
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Description</h2>
        <p className="prose">{product.description}</p>
        {product.specs.length > 0 && (
          <table className="specs">
            <tbody>
              {product.specs.map((s, i) => (
                <tr key={i}>
                  <th>{s.key}</th>
                  <td>{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Reviews</h2>
        </div>
        {user && (
          <form className="review-form" onSubmit={submitReview}>
            <h3>Write a review</h3>
            <div className="review-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={n <= reviewRating ? 'star on' : 'star'}
                  onClick={() => setReviewRating(n)}
                  aria-label={`${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>
            <input
              className="input"
              placeholder="Title (optional)"
              value={reviewTitle}
              maxLength={120}
              onChange={(e) => setReviewTitle(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="Tell others what you think…"
              value={reviewBody}
              maxLength={5000}
              rows={4}
              onChange={(e) => setReviewBody(e.target.value)}
            />
            <ErrorNotice message={reviewError} />
            {reviewMsg && <div className="notice notice-success">{reviewMsg}</div>}
            <button className="btn btn-primary" disabled={submittingReview}>
              Submit review
            </button>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="muted">No reviews yet — be the first.</p>
        ) : (
          reviews.map((r) => (
            <article key={r.id} className="review">
              <div className="review-head">
                <Stars rating={r.rating} />
                <span className="review-title">{r.title || 'Review'}</span>
                <span className="muted">{formatDate(r.createdAt)}</span>
              </div>
              <p className="prose">{r.body}</p>
              {r.isVerifiedPurchase && <span className="badge badge-good">Verified purchase</span>}
            </article>
          ))
        )}
        {reviewPages > 1 && (
          <div className="pagination">
            <button disabled={reviewPage <= 1} onClick={() => setReviewPage((p) => p - 1)}>
              ← Prev
            </button>
            <span>
              Page {reviewPage} of {reviewPages}
            </span>
            <button disabled={reviewPage >= reviewPages} onClick={() => setReviewPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
