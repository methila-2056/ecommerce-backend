import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import { Product } from '../catalog/product.model.js';
import { Wishlist } from './wishlist.model.js';

export interface WishlistItemPublic {
  productId: string;
  addedAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    priceCents: number | null;
    inStock: boolean;
    available: boolean;
  } | null;
}

export async function getWishlist(userId: string): Promise<WishlistItemPublic[]> {
  const wishlist = await Wishlist.findOne({ userId });
  if (!wishlist || wishlist.items.length === 0) return [];

  const productIds = wishlist.items.map((i) => i.productId.toString());
  const products = await Product.find({ _id: { $in: productIds } }).lean();

  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  return wishlist.items.map((item) => {
    const product = byId.get(item.productId.toString());
    if (!product)
      return {
        productId: item.productId.toString(),
        addedAt: item.addedAt.toISOString(),
        product: null,
      };

    const activeVariants = (
      product.variants as unknown as Array<{
        priceCents: number;
        isActive: boolean;
        stock: { available: number };
      }>
    ).filter((v) => v.isActive);
    const inStock = activeVariants.some((v) => v.stock.available > 0);
    const prices = activeVariants.filter((v) => v.stock.available > 0).map((v) => v.priceCents);
    const available = product.status === 'published' && product.isActive;

    return {
      productId: item.productId.toString(),
      addedAt: item.addedAt.toISOString(),
      product: {
        id: product._id.toString(),
        name: product.name,
        slug: product.slug,
        image: product.images[0] ?? null,
        priceCents: prices.length > 0 ? Math.min(...prices) : null,
        inStock,
        available,
      },
    };
  });
}

export async function isInWishlist(userId: string, productId: string): Promise<boolean> {
  const wishlist = await Wishlist.exists({ userId, 'items.productId': productId });
  return wishlist !== null;
}

export async function addToWishlist(
  userId: string,
  productId: string,
): Promise<WishlistItemPublic[]> {
  const product = await Product.exists({ _id: productId });
  if (!product) throw AppError.notFound('Product not found');

  // Ensure the wishlist document exists, then append only when this product is
  // not saved yet ($addToSet cannot be used here because each item carries a
  // distinct addedAt timestamp, which would create duplicates).
  await Wishlist.updateOne({ userId }, { $setOnInsert: { items: [] } }, { upsert: true });
  await Wishlist.updateOne(
    { userId, 'items.productId': { $ne: productId } },
    { $push: { items: { productId, addedAt: new Date() } } },
  );
  recordAudit('wishlist.item_added', { productId }, { actorId: userId });
  return getWishlist(userId);
}

export async function removeFromWishlist(
  userId: string,
  productId: string,
): Promise<WishlistItemPublic[]> {
  await Wishlist.updateOne({ userId }, { $pull: { items: { productId } } });
  recordAudit('wishlist.item_removed', { productId }, { actorId: userId });
  return getWishlist(userId);
}

export async function clearWishlist(userId: string): Promise<WishlistItemPublic[]> {
  await Wishlist.deleteOne({ userId });
  return [];
}
