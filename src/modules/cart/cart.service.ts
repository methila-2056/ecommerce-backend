import { Types } from 'mongoose';
import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import { Product } from '../catalog/product.model.js';
import { Cart, MAX_ITEM_QUANTITY } from './cart.model.js';

// The cart stores only references and quantities. Every price shown here is
// re-read from the product document at read time, and the order module
// re-derives totals from the database at checkout — the backend never trusts
// client-supplied prices (a core security rule of this project).

export interface CartItemPublic {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  image: string | null;
  attributes: Record<string, string>;
  unitPriceCents: number;
  compareAtPriceCents: number | null;
  taxRate: number;
  quantity: number;
  available: number;
  lineTotalCents: number;
  inStock: boolean;
  productAvailable: boolean;
}

export interface CartPublic {
  items: CartItemPublic[];
  itemCount: number;
  subtotalCents: number;
}

async function getOrCreateCart(userId: string): Promise<InstanceType<typeof Cart>> {
  return Cart.findOneAndUpdate(
    { userId },
    { $setOnInsert: { items: [] } },
    { upsert: true, new: true },
  );
}

function findVariant(product: { variants: ReadonlyArray<unknown> }, variantId: string) {
  return product.variants.find(
    (v) => (v as { _id?: { toString(): string } })._id?.toString() === variantId,
  );
}

export async function getCart(userId: string): Promise<CartPublic> {
  const cart = await getOrCreateCart(userId);
  return enrichCart(cart.items);
}

async function enrichCart(
  items: Array<{ productId: Types.ObjectId; variantId: Types.ObjectId; quantity: number }>,
): Promise<CartPublic> {
  if (items.length === 0) {
    return { items: [], itemCount: 0, subtotalCents: 0 };
  }

  const variantIds = items.map((i) => i.variantId.toString());
  const products = await Product.find({ 'variants._id': { $in: variantIds } }).lean();

  const publicItems: CartItemPublic[] = [];
  let subtotalCents = 0;

  for (const item of items) {
    const product = products.find((p) =>
      (p.variants as unknown as Array<{ _id: unknown }>).some(
        (v) => (v._id as { toString(): string }).toString() === item.variantId.toString(),
      ),
    );
    const variant = product ? findVariant(product, item.variantId.toString()) : undefined;

    if (!product || !variant) {
      publicItems.push({
        productId: item.productId.toString(),
        variantId: item.variantId.toString(),
        sku: '',
        productName: 'Unavailable product',
        productSlug: '',
        image: null,
        attributes: {},
        unitPriceCents: 0,
        compareAtPriceCents: null,
        taxRate: 0,
        quantity: item.quantity,
        available: 0,
        lineTotalCents: 0,
        inStock: false,
        productAvailable: false,
      });
      continue;
    }

    const variantWithStock = variant as unknown as {
      sku: string;
      attributes: Record<string, string>;
      priceCents: number;
      compareAtPriceCents: number | null;
      taxRate: number;
      stock: { available: number };
      isActive: boolean;
      images: string[];
    };
    const unitPriceCents = variantWithStock.priceCents;
    const lineTotalCents = unitPriceCents * item.quantity;
    subtotalCents += lineTotalCents;

    publicItems.push({
      productId: product._id.toString(),
      variantId: item.variantId.toString(),
      sku: variantWithStock.sku,
      productName: product.name,
      productSlug: product.slug,
      image: product.images[0] ?? variantWithStock.images[0] ?? null,
      attributes: variantWithStock.attributes,
      unitPriceCents,
      compareAtPriceCents: variantWithStock.compareAtPriceCents,
      taxRate: variantWithStock.taxRate,
      quantity: item.quantity,
      available: variantWithStock.stock.available,
      lineTotalCents,
      inStock: variantWithStock.stock.available > 0,
      productAvailable:
        product.status === 'published' && product.isActive === true && variantWithStock.isActive,
    });
  }

  return {
    items: publicItems,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    subtotalCents,
  };
}

async function resolveVariant(productId: string, variantId: string) {
  const product = await Product.findOne({ _id: productId, 'variants._id': variantId }).lean();
  if (!product)
    throw AppError.badRequest('Product variant does not exist', { errorCode: 'VARIANT_NOT_FOUND' });
  if (product.status !== 'published' || product.isActive !== true) {
    throw AppError.badRequest('This product is not available for purchase', {
      errorCode: 'PRODUCT_UNAVAILABLE',
    });
  }
  const variant = findVariant(product, variantId);
  if (!variant)
    throw AppError.badRequest('Product variant does not exist', { errorCode: 'VARIANT_NOT_FOUND' });
  const variantWithStock = variant as unknown as {
    isActive: boolean;
    stock: { available: number };
  };
  if (!variantWithStock.isActive) {
    throw AppError.badRequest('This variant is not available', {
      errorCode: 'VARIANT_UNAVAILABLE',
    });
  }
  return { product, variant: variantWithStock };
}

export async function addItem(
  userId: string,
  productId: string,
  variantId: string,
  quantity: number,
): Promise<CartPublic> {
  await resolveVariant(productId, variantId);

  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((i) => i.variantId.toString() === variantId);
  const newQuantity = (existing?.quantity ?? 0) + quantity;

  if (newQuantity > MAX_ITEM_QUANTITY) {
    throw AppError.badRequest(`Maximum of ${MAX_ITEM_QUANTITY} units per item`, {
      errorCode: 'QUANTITY_LIMIT_EXCEEDED',
    });
  }

  // Cart quantity can never exceed current sellable stock; the authoritative
  // guard is applied again atomically at checkout, but failing early gives the
  // customer feedback while browsing.
  const availability = await checkAvailability(productId, variantId);
  if (newQuantity > availability) {
    throw AppError.badRequest(`Only ${availability} units are currently available`, {
      errorCode: 'INSUFFICIENT_STOCK',
    });
  }

  if (existing) {
    existing.quantity = newQuantity;
  } else {
    cart.items.push({
      productId: new Types.ObjectId(productId),
      variantId: new Types.ObjectId(variantId),
      quantity,
      addedAt: new Date(),
    });
  }
  await cart.save();
  recordAudit('cart.item_added', { userId, productId, variantId, quantity });
  return enrichCart(cart.items);
}

export async function updateItemQuantity(
  userId: string,
  variantId: string,
  quantity: number,
): Promise<CartPublic> {
  const cart = await getOrCreateCart(userId);
  const item = cart.items.find((i) => i.variantId.toString() === variantId);
  if (!item) throw AppError.notFound('Item not found in cart');

  if (quantity > MAX_ITEM_QUANTITY) {
    throw AppError.badRequest(`Maximum of ${MAX_ITEM_QUANTITY} units per item`, {
      errorCode: 'QUANTITY_LIMIT_EXCEEDED',
    });
  }

  const availability = await checkAvailability(item.productId.toString(), variantId);
  if (quantity > availability) {
    throw AppError.badRequest(`Only ${availability} units are currently available`, {
      errorCode: 'INSUFFICIENT_STOCK',
    });
  }

  item.quantity = quantity;
  await cart.save();
  recordAudit('cart.item_updated', { userId, variantId, quantity });
  return enrichCart(cart.items);
}

export async function removeItem(userId: string, variantId: string): Promise<CartPublic> {
  const cart = await getOrCreateCart(userId);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => i.variantId.toString() !== variantId);
  if (cart.items.length === before) throw AppError.notFound('Item not found in cart');
  await cart.save();
  recordAudit('cart.item_removed', { userId, variantId });
  return enrichCart(cart.items);
}

export async function clearCart(userId: string): Promise<CartPublic> {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  await cart.save();
  recordAudit('cart.cleared', { userId });
  return { items: [], itemCount: 0, subtotalCents: 0 };
}

export async function checkAvailability(productId: string, variantId: string): Promise<number> {
  const { variant } = await resolveVariant(productId, variantId);
  return (variant as unknown as { stock: { available: number } }).stock.available;
}
