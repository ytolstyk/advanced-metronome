import { createContext } from 'react';
import type { RootNote, ChordType } from '../data/chords';

export interface FavoritesContextValue {
  favorites: Set<string>;
  isFavorite: (root: RootNote, type: ChordType) => boolean;
  toggleFavorite: (root: RootNote, type: ChordType) => void;
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null);
