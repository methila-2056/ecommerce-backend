import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Brand, Category, Product } from '../api/types';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ErrorNotice, Pagination, Spinner } from '../components/ui';

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const page = Number(params.get('page') ?? '1');
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const brand = params.get('brand') ?? '';
  const inStock = params.get('inStock') === 'true';
  const sort = params.get('sort') ?? 'newest';

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('limit', '12');
        if (q) qs.set('keyword', q);
        if (category) qs.set('category', category);
        if (brand) qs.set('brand', brand);
        if (inStock) qs.set('inStock', 'true');
        if (sort) qs.set('sort', sort);

        const res = await api.get<Product[]>(`/api/v1/products?${qs.toString()}`);
        setProducts(res.data);
        setTotal(res.meta?.total ?? res.data.length);
        setPages(Math.max(1, res.meta?.totalPages ?? 1));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load products');
      } finally {
        setLoading(false);
      }
    })();
  }, [page, q, category, brand, inStock, sort]);

  useEffect(() => {
    (async () => {
      const [c, b] = await Promise.all([
        api.get<Category[]>('/api/v1/categories').catch(() => null),
        api.get<Brand[]>('/api/v1/brands').catch(() => null),
      ]);
      if (c) setCategories(c.data);
      if (b) setBrands(b.data);
    })();
  }, []);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === '' || v === 'false') next.delete(k);
      else next.set(k, v);
    });
    next.delete('page');
    setParams(next);
  };

  return (
    <div className="container section shop">
      <aside className="filters">
        <h3>Filters</h3>
        <label className="filter-group">
          <span>Category</span>
          <select value={category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          <span>Brand</span>
          <select value={brand} onChange={(e) => update({ brand: e.target.value })}>
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.slug}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          <span>Sort</span>
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="newest">Newest</option>
            <option value="rating">Top rated</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="relevance">Relevance</option>
          </select>
        </label>
        <label className="filter-check">
          <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: String(e.target.checked) })} />
          In stock only
        </label>
        {q && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ q: '' })}>
            Clear search “{q}”
          </button>
        )}
      </aside>

      <section className="shop-main">
        <div className="section-head">
          <h2 className="section-title">
            {q ? `Results for “${q}”` : 'All products'}
            <span className="muted count">{total} item{total === 1 ? '' : 's'}</span>
          </h2>
        </div>
        <ErrorNotice message={error} />
        {loading ? (
          <Spinner label="Loading products…" />
        ) : products.length === 0 ? (
          <EmptyState title="No products found" body="Try adjusting your filters or search." />
        ) : (
          <>
            <div className="product-grid">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Pagination page={page} pages={pages} onChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
