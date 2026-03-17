import { useContext } from 'react';
import { FavoritesContext } from '../context/favoritesContextDef';
import type { FavoritesContextValue } from '../context/favoritesContextDef';

export type { FavoritesContextValue };

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
