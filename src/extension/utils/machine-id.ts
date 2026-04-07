
import crypto from 'crypto';
import os from 'os';
import { execSync } from 'child_process';

let cachedMachineId: string | null = null;

export function machineIdSync(): string {
  if (cachedMachineId) {
    return cachedMachineId;
  }

  let id: string | null = null;

  try {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: Use IOPlatformUUID
      try {
        const output = execSync(
          "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
          { encoding: 'utf8', timeout: 5000 }
        );
        const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
        if (match) {
          id = match[1];
        }
      } catch {
        // Fallback if ioreg fails
      }
    } else if (platform === 'linux') {
      // Linux: Try various methods
      const fs = require('fs');
      const paths = [
        '/var/lib/dbus/machine-id',
        '/etc/machine-id'
      ];

      for (const path of paths) {
        try {
          if (fs.existsSync(path)) {
            id = fs.readFileSync(path, 'utf8').trim();
            break;
          }
        } catch {
        }
      }
    } else if (platform === 'win32') {
      // Windows: Use MachineGuid from registry
      try {
        const output = execSync(
          'REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid',
          { encoding: 'utf8', timeout: 5000 }
        );
        const match = output.match(/MachineGuid\s+REG_SZ\s+(.+)/);
        if (match) {
          id = match[1].trim();
        }
      } catch {
        // Fallback if registry query fails
      }
    }
  } catch (error) {
    console.warn('Failed to get machine ID:', error);
  }

  // Fallback: Generate a consistent ID from machine characteristics
  if (!id) {
    const characteristics = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model || 'unknown-cpu',
      os.totalmem().toString(),
      // Network interfaces (excluding loopback)
      ...Object.values(os.networkInterfaces())
        .flat()
        .filter((iface): iface is os.NetworkInterfaceInfo =>
          iface !== undefined && !iface.internal && iface.mac !== '00:00:00:00:00:00'
        )
        .map(iface => iface.mac)
        .slice(0, 2) // Use first 2 MAC addresses
    ].join(':');

    id = crypto.createHash('sha256').update(characteristics).digest('hex');
  }

  // Hash the ID to ensure consistent format
  cachedMachineId = crypto.createHash('sha256').update(id).digest('hex');
  return cachedMachineId;
}

export async function machineId(): Promise<string> {
  return machineIdSync();
}
