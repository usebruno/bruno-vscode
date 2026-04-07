import crypto from 'crypto';
import { machineIdSync } from './machine-id';

const AES256_ALGO = '01';

// NOTE: Electron's safeStorage is not available in VS Code
// We use AES256 encryption with machine ID as the key
// For VS Code, we could use vscode.SecretStorage for sensitive data

interface EncryptResult {
  success: boolean;
  value: string;
  error?: string;
}

function deriveKeyAndIv(password: string, keyLength: number, ivLength: number): { key: Buffer; iv: Buffer } {
  const key = Buffer.alloc(keyLength);
  const iv = Buffer.alloc(ivLength);
  const derivedBytes: Buffer[] = [];
  let lastHash: Buffer | null = null;

  while (Buffer.concat(derivedBytes).length < keyLength + ivLength) {
    const hash = crypto.createHash('md5');
    if (lastHash) {
      hash.update(lastHash);
    }
    hash.update(Buffer.from(password, 'utf8'));
    lastHash = hash.digest();
    derivedBytes.push(lastHash);
  }

  const concatenatedBytes = Buffer.concat(derivedBytes);
  concatenatedBytes.copy(key, 0, 0, keyLength);
  concatenatedBytes.copy(iv, 0, keyLength, keyLength + ivLength);

  return { key, iv };
}

function aes256Encrypt(data: string, passkey: string | null = null): string {
  const rawKey = passkey || machineIdSync();
  const iv = Buffer.alloc(16, 0);
  const key = crypto.createHash('sha256').update(rawKey).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function aes256Decrypt(data: string, passkey: string | null = null): string {
  const rawKey = passkey || machineIdSync();
  const iv = Buffer.alloc(16, 0);
  const key = crypto.createHash('sha256').update(rawKey).digest();

  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Fallback to old key derivation method
    try {
      const { key: oldKey, iv: oldIv } = deriveKeyAndIv(rawKey, 32, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', oldKey, oldIv);
      let decrypted = decipher.update(data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (fallbackErr) {
      console.error('AES256 decryption failed with both methods:', err, fallbackErr);
      throw new Error('AES256 decryption failed: ' + (fallbackErr as Error).message);
    }
  }
}

export function encryptString(str: string, passkey: string | null = null): string {
  if (typeof str !== 'string') {
    throw new Error('Encrypt failed: invalid string');
  }
  if (str.length === 0) {
    return '';
  }

  if (passkey !== null && passkey !== undefined) {
    if (typeof passkey !== 'string' || passkey.length === 0) {
      return '';
    }
    try {
      const encryptedString = aes256Encrypt(str, passkey);
      return `$${AES256_ALGO}:${encryptedString}`;
    } catch {
      return '';
    }
  }

  // In VS Code, always use AES256 (no safeStorage available)
  const encryptedString = aes256Encrypt(str);
  return `$${AES256_ALGO}:${encryptedString}`;
}

export function decryptString(str: string, passkey: string | null = null): string {
  if (typeof str !== 'string') {
    throw new Error('Decrypt failed: unrecognized string format');
  }
  if (str.length === 0) {
    return '';
  }

  const colonIndex = str.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Decrypt failed: unrecognized string format');
  }

  const algo = str.substring(1, colonIndex);
  const encryptedString = str.substring(colonIndex + 1);

  // For safeStorage encrypted strings, we can't decrypt in VS Code
  if (algo === '00') {
    console.warn('Cannot decrypt Electron safeStorage encrypted string in VS Code');
    return '';
  }

  if (algo === AES256_ALGO) {
    return aes256Decrypt(encryptedString, passkey);
  }

  throw new Error('Decrypt failed: Invalid algo');
}

export function decryptStringSafe(str: string): EncryptResult {
  try {
    const result = decryptString(str);
    return { success: true, value: result };
  } catch (err) {
    console.error('Decryption failed:', (err as Error).message);
    return { success: false, error: (err as Error).message, value: '' };
  }
}

export function encryptStringSafe(str: string): EncryptResult {
  try {
    const result = encryptString(str);
    return { success: true, value: result };
  } catch (err) {
    console.error('Encryption failed:', (err as Error).message);
    return { success: false, error: (err as Error).message, value: '' };
  }
}
