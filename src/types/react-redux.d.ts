import 'react-redux';
import type { RootState } from '../webview/providers/ReduxStore/index';

declare module 'react-redux' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface DefaultRootState extends RootState {}
}
