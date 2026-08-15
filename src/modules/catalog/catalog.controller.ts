import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as catalogService from './catalog.service.js';

function requireUser(req: Request): { userId: string; actorId: string } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  return { userId: req.user.userId, actorId: req.user.userId };
}

// ---- Public storefront ----

export async function searchProducts(req: Request, res: Response): Promise<void> {
  const result = await catalogService.searchProducts(req.query as never);
  sendSuccess(res, result.products, 'Products retrieved successfully', result.meta);
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const product = await catalogService.getProductById(id, { includeStock: false });
  sendSuccess(res, product, 'Product retrieved successfully');
}

export async function getProductBySlug(req: Request, res: Response): Promise<void> {
  const { slug } = req.params as { slug: string };
  const product = await catalogService.getProductBySlug(slug);
  sendSuccess(res, product, 'Product retrieved successfully');
}

// ---- Admin / Seller catalog management ----

export async function adminSearchProducts(req: Request, res: Response): Promise<void> {
  const result = await catalogService.searchProducts(req.query as never, { adminView: true });
  sendSuccess(res, result.products, 'Products retrieved successfully', result.meta);
}

export async function adminGetProduct(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const product = await catalogService.getProductById(id, {
    includeStock: true,
    allowInactive: true,
  });
  sendSuccess(res, product, 'Product retrieved successfully');
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const product = await catalogService.createProduct(req.body, actorId);
  sendSuccess(res, product, 'Product created successfully', undefined, 201);
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const product = await catalogService.updateProduct(id, req.body, actorId);
  sendSuccess(res, product, 'Product updated successfully');
}

export async function setProductStatus(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: string };
  const product = await catalogService.setProductStatus(id, status as never, actorId);
  sendSuccess(res, product, 'Product status updated successfully');
}

export async function archiveProduct(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  await catalogService.archiveProduct(id, actorId);
  sendSuccess(res, null, 'Product archived successfully');
}

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = await catalogService.listCategories();
  sendSuccess(res, categories, 'Categories retrieved successfully');
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const category = await catalogService.createCategory(req.body, actorId);
  sendSuccess(res, category, 'Category created successfully', undefined, 201);
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const category = await catalogService.updateCategory(id, req.body, actorId);
  sendSuccess(res, category, 'Category updated successfully');
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  await catalogService.deleteCategory(id, actorId);
  sendSuccess(res, null, 'Category deleted successfully');
}

export async function listBrands(_req: Request, res: Response): Promise<void> {
  const brands = await catalogService.listBrands();
  sendSuccess(res, brands, 'Brands retrieved successfully');
}

export async function createBrand(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const brand = await catalogService.createBrand(req.body, actorId);
  sendSuccess(res, brand, 'Brand created successfully', undefined, 201);
}

export async function updateBrand(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const brand = await catalogService.updateBrand(id, req.body, actorId);
  sendSuccess(res, brand, 'Brand updated successfully');
}

export async function deleteBrand(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  await catalogService.deleteBrand(id, actorId);
  sendSuccess(res, null, 'Brand deleted successfully');
}
