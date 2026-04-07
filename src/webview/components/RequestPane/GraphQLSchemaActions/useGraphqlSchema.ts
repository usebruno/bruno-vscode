import { useState } from 'react';
import toast from 'react-hot-toast';
import { buildClientSchema, buildSchema, IntrospectionQuery } from 'graphql';
import { fetchGqlSchema } from 'utils/network';
import { simpleHash, safeParseJSON } from 'utils/common';

const schemaHashPrefix = 'bruno.graphqlSchema';

interface FetchSchemaResponse {
  status: number;
  statusText: string;
  data?: {
    data?: IntrospectionQuery;
  };
}

const useGraphqlSchema = (endpoint: string, environment: any, request: any, collection: any) => {
  const { ipcRenderer } = window;
  const localStorageKey = `${schemaHashPrefix}.${simpleHash(endpoint)}`;
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [schemaSource, setSchemaSource] = useState('');
  const [schema, setSchema] = useState(() => {
    try {
      const saved = localStorage.getItem(localStorageKey);
      if (!saved) {
        return null;
      }
      let parsedData = safeParseJSON(saved);
      if (typeof parsedData === 'object' && parsedData !== null) {
        return buildClientSchema(parsedData as IntrospectionQuery);
      } else if (typeof parsedData === 'string') {
        return buildSchema(parsedData);
      }
      return null;
    } catch {
      localStorage.removeItem(localStorageKey);
      return null;
    }
  });

  const loadSchemaFromIntrospection = async () => {
    const response = await fetchGqlSchema(endpoint, environment, request, collection) as FetchSchemaResponse | null;
    if (!response) {
      throw new Error('Introspection query failed');
    }
    if (response.status !== 200) {
      throw new Error(response.statusText);
    }
    const data = response.data?.data;
    if (!data) {
      throw new Error('No data returned from introspection query');
    }
    setSchemaSource('introspection');
    return data;
  };

  const loadSchemaFromFile = async (): Promise<IntrospectionQuery | string | undefined> => {
    const schemaContent = await ipcRenderer.invoke('renderer:load-gql-schema-file') as { data?: IntrospectionQuery | string } | string | null;
    if (!schemaContent) {
      setIsLoading(false);
      return undefined;
    }
    setSchemaSource('file');
    if (typeof schemaContent === 'object' && 'data' in schemaContent) {
      return schemaContent.data as IntrospectionQuery | string | undefined;
    }
    return schemaContent as string;
  };

  const loadSchema = async (source: 'file' | 'introspection') => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      let data: IntrospectionQuery | string | undefined;
      if (source === 'file') {
        data = await loadSchemaFromFile();
      } else {
        // fallback to introspection if source is unknown
        data = await loadSchemaFromIntrospection();
      }
      if (data) {
        if (typeof data === 'object') {
          setSchema(buildClientSchema(data as IntrospectionQuery));
        } else {
          setSchema(buildSchema(data));
        }
        localStorage.setItem(localStorageKey, JSON.stringify(data));
        toast.success('GraphQL Schema loaded successfully');
      }
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error(err);
      toast.error(`Error occurred while loading GraphQL Schema: ${error.message}`);
    }

    setIsLoading(false);
  };

  return {
    isLoading,
    schema,
    schemaSource,
    loadSchema,
    error
  };
};

export default useGraphqlSchema;
