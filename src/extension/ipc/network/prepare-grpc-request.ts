/**
 * gRPC request preparation utilities
 *
 * TODO: Complete implementation when gRPC dependencies are available
 */

interface GrpcRequest {
  url: string;
  service: string;
  method: string;
  protoFile?: string;
  message?: string;
  metadata?: Array<{ name: string; value: string; enabled?: boolean }>;
}

interface PreparedGrpcRequest {
  address: string;
  service: string;
  method: string;
  protoPath?: string;
  message: unknown;
  metadata: Record<string, string>;
}

const prepareGrpcRequest = (request: GrpcRequest): PreparedGrpcRequest => {
  let message: unknown = {};
  if (request.message) {
    try {
      message = JSON.parse(request.message);
    } catch {
      console.warn('Failed to parse gRPC message JSON');
    }
  }

  const metadata: Record<string, string> = {};
  if (request.metadata) {
    for (const meta of request.metadata) {
      if (meta.enabled !== false && meta.name) {
        metadata[meta.name] = meta.value || '';
      }
    }
  }

  return {
    address: request.url,
    service: request.service,
    method: request.method,
    protoPath: request.protoFile,
    message,
    metadata
  };
};

export default prepareGrpcRequest;
export { prepareGrpcRequest, GrpcRequest, PreparedGrpcRequest };
