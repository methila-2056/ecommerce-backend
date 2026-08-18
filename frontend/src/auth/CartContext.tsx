import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Cart } from '../api/types';
import { useAuth } from './AuthContext';

interface CartContextValue {
  cart: Cart | null;
  refresh: () => Promise<void>;
  addItem: (productId: string, variantId: string, quantity: number) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(null);
      return;
    }
    try {
      const res = await api.get<Cart>('/api/v1/cart');
      setCart(res.data);
    } catch {
      setCart(null);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(async (productId: string, variantId: string, quantity: number) => {
    const res = await api.post<Cart>('/api/v1/cart', { productId, variantId, quantity });
    setCart(res.data);
  }, []);

  const setQuantity = useCallback(async (variantId: string, quantity: number) => {
    const res = await api.patch<Cart>(`/api/v1/cart/items/${variantId}`, { quantity });
    setCart(res.data);
  }, []);

  const removeItem = useCallback(async (variantId: string) => {
    const res = await api.delete<Cart>(`/api/v1/cart/items/${variantId}`);
    setCart(res.data);
  }, []);

  const clear = useCallback(async () => {
    const res = await api.delete<Cart>('/api/v1/cart');
    setCart(res.data);
  }, []);

  return (
    <CartContext.Provider value={{ cart, refresh, addItem, setQuantity, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
