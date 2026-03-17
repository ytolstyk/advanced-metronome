import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { RootNote, ChordType } from '../data/chords';
import { addFavorite, loadFavorites, removeFavorite, toFavoriteKey } from '../api/chordsApi';
import { FavoritesContext } from './favoritesContextDef';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const idMapRef = useRef<Map<string, string>>(new Map());
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus]);

  useEffect(() => {
    void loadFavorites().then(({ set, idMap }) => {
      setFavorites(new Set(set));
      idMapRef.current = idMap;
    });
  }, [authStatus]);

  const isFavorite = useCallback(
    (root: RootNote, type: ChordType) => favorites.has(toFavoriteKey(root, type)),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (root: RootNote, type: ChordType) => {
      const key = toFavoriteKey(root, type);
      if (favorites.has(key)) {
        const cloudId = idMapRef.current.get(key);
        idMapRef.current.delete(key);
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        void removeFavorite(root, type, cloudId);
      } else {
        setFavorites(prev => new Set([...prev, key]));
        void addFavorite(root, type).then(id => {
          if (id) idMapRef.current.set(key, id);
        });
      }
    },
    [favorites],
  );

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}
