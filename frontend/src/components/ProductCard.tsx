import { Link } from 'react-router-dom';
import type { Product } from '../api/types';
import { Price, Stars } from './ui';

export function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0] ?? product.variants?.[0]?.images?.[0] ?? null;
  return (
    <Link to={`/products/${product.slug}`} className="product-card">
      <div className="product-card-media">
        {image ? <img src={image} alt={product.name} loading="lazy" /> : <div className="img-placeholder">📦</div>}
        {!product.inStock && <span className="ribbon">Out of stock</span>}
        {product.inStock && <span className="ribbon ribbon-good">In stock</span>}
      </div>
      <div className="product-card-body">
        <div className="product-card-meta">
          {product.brand && <span className="product-brand">{product.brand}</span>}
          <Stars rating={product.averageRating} />
        </div>
        <h3 className="product-card-title">{product.name}</h3>
        <p className="product-card-summary">{product.summary}</p>
        <Price priceCents={product.minPriceCents} compareAtPriceCents={undefined} />
      </div>
    </Link>
  );
}
