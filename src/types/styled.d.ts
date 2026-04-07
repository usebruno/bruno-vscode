import 'styled-components';
import type { BrunoTheme } from '../bruno-types/app/theme';

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  export interface DefaultTheme extends BrunoTheme {}
}
