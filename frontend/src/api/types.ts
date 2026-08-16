export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: PaginationMeta;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  roles: string[];
  status: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface Address {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parent?: string | null;
  order: number;
  isActive: boolean;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

export interface Variant {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  priceCents: number;
  compareAtPriceCents?: number | null;
  taxRate: number;
  images: string[];
  isActive: boolean;
  inStock?: boolean;
  stock?: { quantity: number; reserved: number; available: number; lowStockThreshold: number };
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  summary: string;
  description: string;
  brand?: string | null;
  category?: string | null;
  images: string[];
  specs: { key: string; value: string }[];
  tags: string[];
  status: string;
  isActive: boolean;
  publishedAt?: string | null;
  variants: Variant[];
  minPriceCents?: number | null;
  inStock: boolean;
  averageRating: number;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  image?: string | null;
  attributes: Record<string, string>;
  unitPriceCents: number;
  compareAtPriceCents?: number | null;
  taxRate: number;
  quantity: number;
  lineTotalCents: number;
  available: number;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
}

export interface OrderItem {
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  image?: string | null;
  attributes: Record<string, string>;
  unitPriceCents: number;
  taxRate: number;
  taxAmountCents: number;
  discountCents: number;
  lineTotalCents: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  items: OrderItem[];
  subtotalCents: number;
  discountTotalCents: number;
  couponCode?: string | null;
  couponDiscountCents: number;
  taxTotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  status: string;
  statusHistory: { status: string; note?: string; changedBy?: string | null; at: string }[];
  paymentId?: string | null;
  paymentStatus?: string | null;
  stockDeducted: boolean;
  placedAt: string;
  cancelledAt?: string | null;
  cancelledReason?: string | null;
  refunds: {
    amountCents: number;
    reason: string;
    status: string;
    paymentRefundId?: string | null;
    at: string;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  isVerifiedPurchase: boolean;
  moderationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface WishlistItem {
  product: Product;
  addedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  provider: string;
  providerReference: string;
  amountCents: number;
  currency: string;
  status: string;
  refundedCents: number;
  refunds: { amountCents: number; reason: string; refundReference: string; at: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  expiresInMs: number;
}
