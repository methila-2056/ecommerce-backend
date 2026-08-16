import type { Types } from 'mongoose';
import { User } from '../modules/user/user.model.js';
import { Category } from '../modules/catalog/category.model.js';
import { Brand } from '../modules/catalog/brand.model.js';
import { Product } from '../modules/catalog/product.model.js';
import { hashPassword } from '../modules/auth/password.service.js';
import { slugify } from '../shared/utils/slugify.js';
import { logger } from '../config/logger.js';

interface SeedVariant {
  sku: string;
  bundle: string;
  priceCents: number;
  compareAtPriceCents?: number;
}

interface SeedProduct {
  name: string;
  summary: string;
  brand: string;
  category: string;
  tags: string[];
  variants: SeedVariant[];
}

const CATEGORIES: string[] = ['Electronics', 'Fashion', 'Home & Kitchen', 'Sports', 'Beauty'];

const BRANDS: string[] = ['NovaTech', 'Pulse', 'Echo', 'Luma', 'Terra', 'Atlas'];

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Aurora Wireless Headphones',
    summary: 'Over-ear headphones with active noise cancellation and 40h battery.',
    brand: 'NovaTech',
    category: 'Electronics',
    tags: ['audio', 'wireless', 'headphones'],
    variants: [
      { sku: 'AURORA-1000', bundle: 'Option 1', priceCents: 32999, compareAtPriceCents: 39599 },
      { sku: 'AURORA-1001', bundle: 'Option 2', priceCents: 39999 },
    ],
  },
  {
    name: 'Pulse Smart Watch Pro',
    summary: 'AMOLED display, GPS, heart-rate and sleep tracking.',
    brand: 'Pulse',
    category: 'Electronics',
    tags: ['wearables', 'smart', 'fitness'],
    variants: [
      { sku: 'PULSES-1000', bundle: 'Option 1', priceCents: 24900, compareAtPriceCents: 29880 },
      { sku: 'PULSES-1001', bundle: 'Option 2', priceCents: 25900, compareAtPriceCents: 29880 },
    ],
  },
  {
    name: 'Nova Soundbar 2.1',
    summary: 'Dolby Atmos soundbar with wireless subwoofer.',
    brand: 'NovaTech',
    category: 'Electronics',
    tags: ['audio', 'home-theater', 'soundbar'],
    variants: [
      { sku: 'NOVASO-1000', bundle: 'Standard', priceCents: 19950, compareAtPriceCents: 23940 },
    ],
  },
  {
    name: 'Echo Portable Speaker',
    summary: 'IPX7 waterproof, 20h playtime, pairs in stereo.',
    brand: 'Echo',
    category: 'Electronics',
    tags: ['audio', 'bluetooth', 'portable'],
    variants: [
      { sku: 'ECHOPO-1000', bundle: 'Standard', priceCents: 5999, compareAtPriceCents: 7999 },
    ],
  },
  {
    name: 'Luma LED Desk Lamp',
    summary: 'Dimmable daylight lamp with USB charging port.',
    brand: 'Luma',
    category: 'Electronics',
    tags: ['lighting', 'desk', 'smart'],
    variants: [
      { sku: 'LUMALE-1000', bundle: 'Standard', priceCents: 3499, compareAtPriceCents: 4199 },
    ],
  },
  {
    name: 'Terra 4K Action Camera',
    summary: 'Waterproof to 30m, 4K60, electronic image stabilisation.',
    brand: 'Terra',
    category: 'Electronics',
    tags: ['camera', 'action', 'outdoors'],
    variants: [
      { sku: 'TERRA4-1000', bundle: 'Option 1', priceCents: 18900, compareAtPriceCents: 22680 },
      { sku: 'TERRA4-1001', bundle: 'Option 2', priceCents: 21900, compareAtPriceCents: 22680 },
    ],
  },
  {
    name: 'Classic Denim Jacket',
    summary: 'Mid-weight cotton denim jacket with a tailored fit.',
    brand: 'Atlas',
    category: 'Fashion',
    tags: ['jacket', 'denim', 'men'],
    variants: [
      { sku: 'CLASSI-1000', bundle: 'Standard', priceCents: 7900, compareAtPriceCents: 9900 },
    ],
  },
  {
    name: 'Merino Wool Scarf',
    summary: 'Soft, breathable merino scarf in a minimalist design.',
    brand: 'Atlas',
    category: 'Fashion',
    tags: ['scarf', 'wool', 'winter'],
    variants: [
      { sku: 'MERINO-1000', bundle: 'Standard', priceCents: 4250, compareAtPriceCents: 5100 },
    ],
  },
  {
    name: 'Everyday Cotton Tee 3-Pack',
    summary: 'Three classic crew-neck tees in organic cotton.',
    brand: 'Pulse',
    category: 'Fashion',
    tags: ['t-shirt', 'basics', 'cotton'],
    variants: [
      { sku: 'EVERYD-1000', bundle: 'Standard', priceCents: 2999, compareAtPriceCents: 3599 },
    ],
  },
  {
    name: 'Leather Crossbody Bag',
    summary: 'Full-grain leather bag with an adjustable strap.',
    brand: 'Luma',
    category: 'Fashion',
    tags: ['bag', 'leather', 'accessories'],
    variants: [
      { sku: 'LEATHE-1000', bundle: 'Option 1', priceCents: 9500, compareAtPriceCents: 11400 },
      { sku: 'LEATHE-1001', bundle: 'Option 2', priceCents: 10500, compareAtPriceCents: 11400 },
    ],
  },
  {
    name: 'Cast Iron Skillet 12"',
    summary: 'Pre-seasoned cast iron skillet, oven-safe to 260°C.',
    brand: 'Terra',
    category: 'Home & Kitchen',
    tags: ['cookware', 'kitchen', 'skillet'],
    variants: [
      { sku: 'CASTIR-1000', bundle: 'Standard', priceCents: 4999, compareAtPriceCents: 5999 },
    ],
  },
  {
    name: 'Ceramic Pour-Over Set',
    summary: 'Hand-glazed dripper and carafe for a slow coffee ritual.',
    brand: 'Echo',
    category: 'Home & Kitchen',
    tags: ['coffee', 'kitchen', 'ceramic'],
    variants: [
      { sku: 'CERAMI-1000', bundle: 'Standard', priceCents: 3800, compareAtPriceCents: 4560 },
    ],
  },
  {
    name: 'Bamboo Cutting Board Set',
    summary: 'Three-bamboo board set with juice grooves and feet.',
    brand: 'Terra',
    category: 'Home & Kitchen',
    tags: ['kitchen', 'bamboo', 'boards'],
    variants: [
      { sku: 'BAMBOO-1000', bundle: 'Standard', priceCents: 4400, compareAtPriceCents: 5280 },
    ],
  },
  {
    name: 'Trail Running Shoes',
    summary: 'Grippy all-terrain trainers with responsive foam.',
    brand: 'Atlas',
    category: 'Sports',
    tags: ['running', 'shoes', 'trail'],
    variants: [
      { sku: 'TRAILR-1000', bundle: 'Option 1', priceCents: 11900, compareAtPriceCents: 14900 },
      { sku: 'TRAILR-1001', bundle: 'Option 2', priceCents: 12900, compareAtPriceCents: 14900 },
    ],
  },
  {
    name: 'Yoga Mat Pro',
    summary: 'Non-slip 6mm mat with alignment lines and carry strap.',
    brand: 'Pulse',
    category: 'Sports',
    tags: ['yoga', 'fitness', 'mat'],
    variants: [
      { sku: 'YOGAMA-1000', bundle: 'Standard', priceCents: 3500, compareAtPriceCents: 4200 },
    ],
  },
  {
    name: 'Insulated Water Bottle',
    summary: 'Vacuum-insulated 750ml bottle, keeps drinks cold 24h.',
    brand: 'Terra',
    category: 'Sports',
    tags: ['bottle', 'hydration', 'outdoors'],
    variants: [
      { sku: 'INSULA-1000', bundle: 'Standard', priceCents: 2499, compareAtPriceCents: 2999 },
    ],
  },
  {
    name: 'Vitamin C Serum',
    summary: '15% vitamin C brightening serum with hyaluronic acid.',
    brand: 'Luma',
    category: 'Beauty',
    tags: ['skincare', 'serum', 'vitamin-c'],
    variants: [
      { sku: 'VITAMI-1000', bundle: 'Standard', priceCents: 2800, compareAtPriceCents: 3360 },
    ],
  },
  {
    name: 'Hydrating Face Cream',
    summary: 'Ceramide-rich daily moisturiser for all skin types.',
    brand: 'Luma',
    category: 'Beauty',
    tags: ['skincare', 'moisturizer', 'face'],
    variants: [
      { sku: 'HYDRAT-1000', bundle: 'Standard', priceCents: 2250, compareAtPriceCents: 2700 },
    ],
  },
];

const SPECS = [
  { key: 'Material', value: 'Premium quality' },
  { key: 'Warranty', value: '12 months' },
];

// Idempotent: safe to call on any boot/run. Skips when the demo customer
// already exists so a real (DATABASE_URL-backed) database is never disturbed.
export async function seedDemoData(): Promise<void> {
  if (await User.exists({ email: 'demo@demo.com' })) {
    logger.info('Demo data already present, skipping seed');
    return;
  }

  await User.create({
    name: 'Demo Customer',
    email: 'demo@demo.com',
    phone: null,
    passwordHash: await hashPassword('Demo123!'),
    roles: ['CUSTOMER'],
    status: 'active',
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    lockUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    addresses: [],
    preferences: { language: 'en', currency: 'USD', newsletter: false, marketingEmails: false },
    deactivatedAt: null,
  });

  const demoAdmin = await User.create({
    name: 'Demo Admin',
    email: 'admin@demo.com',
    phone: null,
    passwordHash: await hashPassword('Admin123!'),
    roles: ['ADMIN'],
    status: 'active',
    emailVerifiedAt: new Date(),
    failedLoginAttempts: 0,
    lockUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    addresses: [],
    preferences: { language: 'en', currency: 'USD', newsletter: false, marketingEmails: false },
    deactivatedAt: null,
  });

  const categoryDocs = await Category.insertMany(
    CATEGORIES.map((name, i) => ({
      name,
      slug: slugify(name),
      parent: null,
      description: `${name} demo category`,
      isActive: true,
      order: i,
    })),
  );
  const categoryIdByName = new Map(
    categoryDocs.map((c) => [c.name, c._id as unknown as Types.ObjectId]),
  );

  const brandDocs = await Brand.insertMany(
    BRANDS.map((name) => ({
      name,
      slug: slugify(name),
      description: `${name} demo brand`,
      isActive: true,
    })),
  );
  const brandIdByName = new Map(brandDocs.map((b) => [b.name, b._id as unknown as Types.ObjectId]));

  await Product.insertMany(
    PRODUCTS.map((p) => {
      const slug = slugify(p.name);
      return {
        name: p.name,
        slug,
        summary: p.summary,
        description: `${p.summary}\n\nDemo catalogue item seeded for the demo database.`,
        brand: brandIdByName.get(p.brand) ?? null,
        category: categoryIdByName.get(p.category) ?? null,
        createdBy: demoAdmin._id,
        images: p.variants.map((_, i) => `https://picsum.photos/seed/${slug}-${i}/640/640`),
        specs: SPECS,
        tags: p.tags,
        status: 'published',
        isActive: true,
        publishedAt: new Date(),
        variants: p.variants.map((v) => ({
          sku: v.sku,
          attributes: { Bundle: v.bundle },
          priceCents: v.priceCents,
          compareAtPriceCents: v.compareAtPriceCents ?? null,
          taxRate: 8,
          stock: { quantity: 100, reserved: 0, available: 100, lowStockThreshold: 5 },
          images: [`https://picsum.photos/seed/${slug}-${p.variants.indexOf(v)}/640/640`],
          isActive: true,
        })),
        averageRating: 0,
        ratingCount: 0,
      };
    }),
  );

  logger.info(
    {
      users: 2,
      categories: categoryDocs.length,
      brands: brandDocs.length,
      products: PRODUCTS.length,
    },
    'Demo data seeded',
  );
  logger.info(
    { customer: 'demo@demo.com / Demo123!', admin: 'admin@demo.com / Admin123!' },
    'Demo accounts ready',
  );
}
