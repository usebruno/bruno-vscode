import { useState } from 'react';
import { loadGrpcMethodsFromReflection } from 'providers/ReduxStore/slices/collections/actions';
import useLocalStorage from 'hooks/useLocalStorage/index';
import { useAppDispatch } from 'providers/ReduxStore/hooks';
import type { AppItem, UID } from '@bruno-types';

interface GrpcMethod {
  [key: string]: unknown;
}

interface ReflectionCache {
  [url: string]: GrpcMethod[];
}

interface LoadMethodsResult {
  methods: GrpcMethod[];
  error: Error | null | unknown;
}

interface UseReflectionManagementReturn {
  isLoadingMethods: boolean;
  reflectionCache: ReflectionCache;
  loadMethodsFromReflection: (url: string, isManualRefresh?: boolean) => Promise<LoadMethodsResult>;
  hasCachedMethods: (url: string) => boolean;
  getCachedMethods: (url: string) => GrpcMethod[];
  clearCacheForUrl: (url: string) => void;
  clearAllCache: () => void;
}

/**
 * Custom hook for managing reflection data and server discovery
 */
export default function useReflectionManagement(item: AppItem, collectionUid: UID): UseReflectionManagementReturn {
  const dispatch = useAppDispatch();

  const [reflectionCache, setReflectionCache] = useLocalStorage<ReflectionCache>('bruno.grpc.reflectionCache', {});
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);

  const loadMethodsFromReflection = async (url: string, isManualRefresh = false): Promise<LoadMethodsResult> => {
    if (!url) {
      return { methods: [], error: new Error('No URL provided') };
    }

    const cachedMethods = reflectionCache[url];
    if (!isManualRefresh && cachedMethods && !isLoadingMethods) {
      return { methods: cachedMethods, error: null as Error | null };
    }

    setIsLoadingMethods(true);
    try {
      const result = await dispatch(loadGrpcMethodsFromReflection(item, collectionUid, url)) as unknown as { methods?: GrpcMethod[]; error?: Error | null };
      const methods = result?.methods || [];
      const error = result?.error || null;

      if (error) {
        console.error('Error loading gRPC methods:', error);
        return { methods: [] as GrpcMethod[], error };
      }

      setReflectionCache((prevCache) => ({
        ...prevCache,
        [url]: methods
      }));

      return { methods, error: null };
    } catch (error) {
      console.error('Error loading gRPC methods:', error);
      return { methods: [], error };
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const hasCachedMethods = (url: string): boolean => {
    return !!(reflectionCache[url] && reflectionCache[url].length > 0);
  };

  const getCachedMethods = (url: string): GrpcMethod[] => {
    return reflectionCache[url] || [];
  };

  const clearCacheForUrl = (url: string): void => {
    setReflectionCache((prevCache) => {
      const newCache = { ...prevCache };
      delete newCache[url];
      return newCache;
    });
  };

  const clearAllCache = (): void => {
    setReflectionCache({});
  };

  return {
    isLoadingMethods,
    reflectionCache,
    loadMethodsFromReflection,
    hasCachedMethods,
    getCachedMethods,
    clearCacheForUrl,
    clearAllCache
  };
}
