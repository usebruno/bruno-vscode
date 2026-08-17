/**
 * Certificate material for the mTLS server.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Generated material sits next to this file, and is gitignored. */
export const CERTS_DIR = path.join(__dirname, 'certs');
export const CA_CERT = path.join(CERTS_DIR, 'ca.crt');
export const SERVER_CERT = path.join(CERTS_DIR, 'server.crt');
export const SERVER_KEY = path.join(CERTS_DIR, 'server.key');
export const CLIENT_CERT = path.join(CERTS_DIR, 'client.crt');
export const CLIENT_KEY = path.join(CERTS_DIR, 'client.key');
export const CLIENT_PFX = path.join(CERTS_DIR, 'client.pfx');
export const UNTRUSTED_CLIENT_CERT = path.join(CERTS_DIR, 'untrusted-client.crt');
export const UNTRUSTED_CLIENT_KEY = path.join(CERTS_DIR, 'untrusted-client.key');

/** Passphrase protecting `client.pfx`. */
export const PFX_PASSPHRASE = 'bruno';

/** The CN the server reports back when the trusted client certificate is presented. */
export const CLIENT_SUBJECT_CN = 'bruno-client';

const BASE_PORT = Number(process.env.PORT || 8081);

// HTTPS + WSS share one port (PORT + 2); mTLS gRPC takes (PORT + 3).
export const MTLS_PORT = Number(process.env.MTLS_PORT) || BASE_PORT + 2;
export const MTLS_GRPC_PORT = Number(process.env.MTLS_GRPC_PORT) || BASE_PORT + 3;

export const MTLS_URL = `https://localhost:${MTLS_PORT}/`;
export const MTLS_WS_URL = `wss://localhost:${MTLS_PORT}/`;
export const MTLS_GRPC_URL = `grpcs://localhost:${MTLS_GRPC_PORT}`;

const CA_KEY = path.join(CERTS_DIR, 'ca.key');
const UNTRUSTED_CA_CERT = path.join(CERTS_DIR, 'untrusted-ca.crt');
const OPENSSL_CNF = path.join(CERTS_DIR, 'openssl.cnf');

const OPENSSL_CONFIG = `[req]
distinguished_name = dn
[dn]
[server_ext]
subjectAltName = DNS:localhost, IP:127.0.0.1
extendedKeyUsage = serverAuth
[client_ext]
extendedKeyUsage = clientAuth
`;

const ALL_FILES = [
  CA_CERT, CA_KEY, SERVER_CERT, SERVER_KEY,
  CLIENT_CERT, CLIENT_KEY, CLIENT_PFX,
  UNTRUSTED_CA_CERT, UNTRUSTED_CLIENT_CERT, UNTRUSTED_CLIENT_KEY
];

const openssl = (args: string[]): void => {
  execFileSync('openssl', args, { cwd: CERTS_DIR, stdio: 'pipe' });
};

/** Generate `<name>.key` + `<name>.crt`, signed by the given CA with the given extensions. */
const signCert = (name: string, cn: string, ext: string, ca: string): void => {
  openssl(['genrsa', '-out', `${name}.key`, '2048']);
  openssl(['req', '-new', '-key', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${cn}`]);
  openssl(['x509', '-req', '-days', '3650', '-in', `${name}.csr`,
    '-CA', `${ca}.crt`, '-CAkey', `${ca}.key`, '-CAcreateserial',
    '-extfile', 'openssl.cnf', '-extensions', ext, '-out', `${name}.crt`]);
};

/** Generate the CA, server and client material if any of it is missing. */
export function generateCerts(force = false): void {
  if (!force && ALL_FILES.every((file) => fs.existsSync(file))) return;

  fs.rmSync(CERTS_DIR, { recursive: true, force: true });
  fs.mkdirSync(CERTS_DIR, { recursive: true });
  fs.writeFileSync(OPENSSL_CNF, OPENSSL_CONFIG, 'utf8');

  // CA
  openssl(['genrsa', '-out', 'ca.key', '2048']);
  openssl(['req', '-new', '-x509', '-days', '3650', '-key', 'ca.key', '-out', 'ca.crt',
    '-subj', '/CN=Bruno E2E CA']);

  // Server and client, both signed by that CA
  signCert('server', 'localhost', 'server_ext', 'ca');
  signCert('client', CLIENT_SUBJECT_CN, 'client_ext', 'ca');

  // Client PFX (PKCS#12).
  openssl(['pkcs12', '-export', '-out', 'client.pfx', '-inkey', 'client.key', '-in', 'client.crt',
    '-certfile', 'ca.crt', '-passout', `pass:${PFX_PASSPHRASE}`]);

  // Untrusted CA + client.
  openssl(['genrsa', '-out', 'untrusted-ca.key', '2048']);
  openssl(['req', '-new', '-x509', '-days', '3650', '-key', 'untrusted-ca.key',
    '-out', 'untrusted-ca.crt', '-subj', '/CN=Untrusted CA']);
  signCert('untrusted-client', 'untrusted-client', 'client_ext', 'untrusted-ca');

  for (const stale of fs.readdirSync(CERTS_DIR)) {
    if (stale.endsWith('.csr') || stale.endsWith('.srl')) {
      fs.rmSync(path.join(CERTS_DIR, stale));
    }
  }
}

if (require.main === module) {
  generateCerts(true);
  console.log(`Generated mTLS certificates in ${CERTS_DIR}`);
  for (const file of fs.readdirSync(CERTS_DIR).sort()) {
    console.log(`  ${file}`);
  }
  console.log(`\nPFX passphrase: ${PFX_PASSPHRASE}`);
}
