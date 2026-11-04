/**
 * Minimal gRPC echo server for e2e tests.
 *
 * Serves the `echo.EchoService/Echo` unary method defined in
 * tests/e2e/utils/fixtures/echo.proto, echoing back the `message` field it receives.
 * The prompt-variable gRPC test loads that same proto in the UI, sets a message
 * containing `{{?prompt}}`, and asserts the interpolated value comes back — which
 * only works if the value was resolved before the request left the client.
 *
 * Runs insecure on grpc://localhost:<port> (no TLS).
 */

import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

export const GRPC_PROTO_PATH = path.resolve(__dirname, '../utils/fixtures/echo.proto');

export function startGrpcServer(port: number): grpc.Server {
  const packageDef = protoLoader.loadSync(GRPC_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;

  const server = new grpc.Server();
  server.addService(proto.echo.EchoService.service, {
    Echo: (call: any, callback: any) => {
      callback(null, { message: call.request.message });
    }
  });

  server.bindAsync(`localhost:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) {
      console.error('[grpc-server] failed to bind:', err.message);
      return;
    }
    console.log(`[grpc-server] Listening on grpc://localhost:${port}`);
  });

  return server;
}
