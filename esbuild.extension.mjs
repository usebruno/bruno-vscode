import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

// Create a require function that uses our local node_modules
const localRequire = createRequire(path.join(__dirname, 'package.json'));
const nodeModulesPath = path.join(__dirname, 'node_modules');

const externalPackages = new Set([
  'vscode'
]);

// Node.js built-in modules (these should be handled by Node at runtime)
const builtins = new Set([
  'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util', 'stream',
  'zlib', 'buffer', 'events', 'child_process', 'net', 'tls', 'dns', 'dgram',
  'readline', 'assert', 'process', 'querystring', 'string_decoder', 'timers',
  'tty', 'v8', 'vm', 'worker_threads', 'module', 'constants',
  'fs/promises', 'stream/promises', 'util/types', 'async_hooks', 'perf_hooks',
  'trace_events', 'cluster', 'console', 'domain', 'inspector', 'repl', 'sys'
]);

// Helper to resolve package from local node_modules directly
function resolveFromNodeModules(pkgPath) {
  // Handle scoped packages
  const parts = pkgPath.split('/');
  let pkgName, subPath;

  if (pkgPath.startsWith('@')) {
    pkgName = parts.slice(0, 2).join('/');
    subPath = parts.slice(2).join('/');
  } else {
    pkgName = parts[0];
    subPath = parts.slice(1).join('/');
  }

  const pkgDir = path.join(nodeModulesPath, pkgName);

  if (!fs.existsSync(pkgDir)) {
    return null;
  }

  if (subPath) {
    // Resolve subpath directly
    const fullPath = path.join(pkgDir, subPath);
    if (fs.existsSync(fullPath)) return fullPath;
    if (fs.existsSync(fullPath + '.js')) return fullPath + '.js';
    if (fs.existsSync(fullPath + '/index.js')) return fullPath + '/index.js';
  }

  // Read package.json for main entry
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const main = pkgJson.main || 'index.js';
    return path.join(pkgDir, main);
  }

  return path.join(pkgDir, 'index.js');
}

// Plugin to patch @usebruno/js node-vm sandbox so it works when bundled with esbuild.
// In a bundled CJS file, `module` inside __commonJS wrappers is esbuild's fake module
// object { exports: {} }, so `module.paths` is undefined. Spreading undefined throws
// "TypeError: undefined is not iterable". This patch falls back to [] so require.resolve
// uses only the explicitly provided paths (additionalContextRoots).
const patchNodeVmPlugin = {
  name: 'patch-node-vm',
  setup(build) {
    build.onLoad({ filter: /node-vm[/\\]index\.js$/ }, async (args) => {
      let contents = await fs.promises.readFile(args.path, 'utf8');
      // Guard: only patch if the problematic spread is present
      if (contents.includes('...module.paths')) {
        // In bundled CJS, module is esbuild's fake { exports: {} }, so module.paths is undefined.
        // Provide the extension's node_modules as the fallback so require('lodash') etc. work.
        // __dirname in the bundled dist/extension.js points to the dist/ directory.
        contents = contents.replaceAll(
          '...module.paths',
          `...(module.paths || [require('path').join(__dirname, '..', 'node_modules')])`
        );
      }
      return { contents, loader: 'js' };
    });
  }
};

// Plugin to bypass Yarn PnP and resolve ALL packages from local node_modules
const bypassPnPPlugin = {
  name: 'bypass-pnp',
  setup(build) {
    // Handle all resolves, including from within node_modules
    build.onResolve({ filter: /.*/ }, (args) => {
      // Skip relative and absolute paths
      if (args.path.startsWith('.') || args.path.startsWith('/')) {
        return null;
      }

      // Handle node: protocol
      if (args.path.startsWith('node:')) {
        return null;
      }

      // Special handling for punycode/ (used by tough-cookie)
      // punycode is deprecated in Node.js but we have it in node_modules
      if (args.path === 'punycode/' || args.path === 'punycode') {
        const resolved = resolveFromNodeModules('punycode');
        if (resolved && fs.existsSync(resolved)) {
          return { path: resolved };
        }
        return null;
      }

      // Get the package name (strip trailing slash)
      const cleanPath = args.path.replace(/\/$/, '');
      const pkgName = cleanPath.startsWith('@')
        ? cleanPath.split('/').slice(0, 2).join('/')
        : cleanPath.split('/')[0];

      // Skip external packages
      if (externalPackages.has(pkgName)) {
        return { path: args.path, external: true };
      }

      // Skip Node.js built-in modules (but not punycode since we handle it above)
      if (builtins.has(pkgName) || builtins.has(cleanPath)) {
        return null;
      }

      // Try to resolve from local node_modules
      try {
        const resolved = localRequire.resolve(args.path);
        if (path.isAbsolute(resolved)) {
          return { path: resolved };
        }
      } catch (e) {
        // Fallback: try to resolve directly from node_modules
        const directResolved = resolveFromNodeModules(args.path);
        if (directResolved && fs.existsSync(directResolved)) {
          return { path: directResolved };
        }
      }

      return null;
    });
  }
};

const buildOptions = {
  entryPoints: ['./src/extension/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
  external: Array.from(externalPackages),
  plugins: [patchNodeVmPlugin, bypassPnPPlugin],
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
  }
};

// Bundle worker-script.js with all its dependencies using esbuild
async function bundleWorkerScript() {
  const workersDir = path.join(__dirname, 'dist', 'workers');
  if (!fs.existsSync(workersDir)) {
    fs.mkdirSync(workersDir, { recursive: true });
  }

  const workerSource = path.join(nodeModulesPath, '@usebruno/filestore/dist/cjs/workers/worker-script.js');
  const workerDest = path.join(workersDir, 'worker-script.js');

  if (fs.existsSync(workerSource)) {
    await esbuild.build({
      entryPoints: [workerSource],
      bundle: true,
      outfile: workerDest,
      format: 'cjs',
      platform: 'node',
      target: 'node18',
      sourcemap: true,
      minify: !isWatch,
      plugins: [bypassPnPPlugin],
    });
    console.log('Bundled worker-script.js to dist/workers/');
  } else {
    console.warn('Warning: worker-script.js not found at', workerSource);
  }
}

// Copy non-JS assets that are needed at runtime
function copyRuntimeAssets() {
  // Copy QuickJS WASM files for @usebruno/js script execution
  const wasmVariants = [
    '@jitl/quickjs-wasmfile-release-sync',
    '@jitl/quickjs-wasmfile-release-asyncify',
    '@jitl/quickjs-wasmfile-debug-sync',
    '@jitl/quickjs-wasmfile-debug-asyncify'
  ];

  const distDir = path.join(__dirname, 'dist');
  for (const variant of wasmVariants) {
    const wasmSource = path.join(nodeModulesPath, variant, 'dist', 'emscripten-module.wasm');
    const wasmDest = path.join(distDir, 'emscripten-module.wasm');

    if (fs.existsSync(wasmSource)) {
      fs.copyFileSync(wasmSource, wasmDest);
      console.log(`Copied emscripten-module.wasm from ${variant} to dist/`);
      break; // Only need one copy
    }
  }
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  await bundleWorkerScript();
  copyRuntimeAssets();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  await bundleWorkerScript();
  copyRuntimeAssets();
  console.log('Extension build complete');
}
