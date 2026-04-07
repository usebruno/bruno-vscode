/**
 * GraphQL introspection request preparation
 *
 * TODO: Complete implementation
 */

import type { AxiosRequestConfig } from 'axios';

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args {
          ...InputValue
        }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args {
        ...InputValue
      }
      type {
        ...TypeRef
      }
      isDeprecated
      deprecationReason
    }
    inputFields {
      ...InputValue
    }
    interfaces {
      ...TypeRef
    }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes {
      ...TypeRef
    }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface PreparedIntrospectionRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data: {
    query: string;
    variables: null;
    operationName: string;
  };
}

const prepareGqlIntrospectionRequest = (
  url: string,
  headers: Record<string, string> = {}
): PreparedIntrospectionRequest => {
  return {
    url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    data: {
      query: INTROSPECTION_QUERY,
      variables: null,
      operationName: 'IntrospectionQuery'
    }
  };
};

export default prepareGqlIntrospectionRequest;
export { prepareGqlIntrospectionRequest, INTROSPECTION_QUERY };
