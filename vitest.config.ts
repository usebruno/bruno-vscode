import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules', 'dist'],
    environment: 'node',
    globals: true
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
      '@bruno-types': path.resolve(__dirname, 'src/bruno-types'),
      'components': path.resolve(__dirname, 'src/webview/components'),
      'providers': path.resolve(__dirname, 'src/webview/providers'),
      'hooks': path.resolve(__dirname, 'src/webview/hooks'),
      'utils': path.resolve(__dirname, 'src/webview/utils'),
      'themes': path.resolve(__dirname, 'src/webview/themes'),
      'assets': path.resolve(__dirname, 'src/webview/assets'),
      'selectors': path.resolve(__dirname, 'src/webview/selectors'),
      'ui': path.resolve(__dirname, 'src/webview/ui'),
      'views': path.resolve(__dirname, 'src/webview/views')
    }
  }
});
