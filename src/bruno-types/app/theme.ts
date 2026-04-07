
export interface ThemeObject {
  [key: string]: any;
  color?: string;
  bg?: string;
  opacity?: string | number;
}

export interface ThemeColors {
  text: {
    muted: string;
    yellow: string;
    danger: string;
    link: string;
    warning: string;
    subtext0: string;
    [key: string]: string;
  };
  bg: {
    danger: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeFont {
  size: {
    xs: string;
    sm: string;
    base: string;
    md: string;
    lg: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeBorder {
  radius: {
    sm: string;
    base: string;
    md: string;
    lg: string;
    [key: string]: string;
  };
  border1?: string;
  border2?: string;
  [key: string]: any;
}

export interface ButtonColorConfig {
  bg: string;
  text: string;
  border: string;
}

export interface ThemeButton2 {
  color: {
    primary: ButtonColorConfig;
    secondary: ButtonColorConfig;
    danger: ButtonColorConfig;
    [key: string]: ButtonColorConfig;
  };
}

export interface ThemeInputPlaceholder {
  color: string;
  opacity: number | string;
}

export interface ThemeInput {
  bg: string;
  border: string;
  focusBorder: string;
  placeholder?: ThemeInputPlaceholder;
  [key: string]: string | ThemeInputPlaceholder | undefined;
}

export interface ThemeDropdown {
  bg: string;
  hoverBg: string;
  border: string;
  [key: string]: string;
}

export interface ThemeTable {
  border: string;
  thead: {
    color: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeTabs {
  marginRight: string;
  active: {
    color: string;
    fontWeight: string | number;
    border: string;
    [key: string]: string | number;
  };
  [key: string]: any;
}

export interface ThemeSidebar {
  bg: string;
  color: string;
  collection: {
    item: {
      hoverBg: string;
      [key: string]: string | Record<string, string>;
    };
    [key: string]: any;
  };
  dragbar: {
    border: string;
    activeBorder: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeCodemirror {
  bg: string;
  border: string;
  [key: string]: any;
}

export interface ThemePrimary {
  solid: string;
  [key: string]: string;
}

export interface ThemeModal {
  body: {
    bg: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeBackground {
  base: string;
  [key: string]: string;
}

export interface ThemeRequestTabPanel {
  url: {
    bg: string;
    [key: string]: string;
  };
  responseOk: string;
  responseError: string;
  responsePending: string;
  responseStatus: string;
  responseOverlayBg: string;
  card: {
    bg: string;
    [key: string]: string;
  };
  [key: string]: any;
}

export interface ThemeInfoTip {
  bg: string;
  border: string;
  boxShadow: string;
  [key: string]: string;
}

export interface ThemeStatusItem {
  background: string;
  text: string;
  [key: string]: string;
}

export interface ThemeStatus {
  warning: ThemeStatusItem;
  error: ThemeStatusItem;
  success: ThemeStatusItem;
  [key: string]: any;
}

export interface BrunoTheme {
  colors: ThemeColors;
  font: ThemeFont;
  border: ThemeBorder;

  button: ThemeObject;
  button2: ThemeButton2;
  input: ThemeInput;
  dropdown: ThemeDropdown;
  table: ThemeTable;
  tabs: ThemeTabs;
  modal: ThemeModal;
  codemirror: ThemeCodemirror;

  sidebar: ThemeSidebar;
  requestTabs: ThemeObject;
  requestTabPanel: ThemeRequestTabPanel;

  // Direct color values (can also be nested objects in some themes)
  bg: ThemeObject;
  text: ThemeObject;
  textLink: string;
  textSecondary: string;
  primary: ThemePrimary;
  background: ThemeBackground;

  grpc: ThemeObject;
  request: ThemeObject;
  app: ThemeObject;
  dragAndDrop: ThemeObject;
  notifications: ThemeObject;
  workspace: ThemeObject;
  brand: string;
  scrollbar: ThemeObject;
  infoTip: ThemeInfoTip;
  statusBar: ThemeObject;
  status: ThemeStatus;
  plainGrid: ThemeObject;
  danger: ThemeObject;
  console: ThemeObject;
  accents: ThemeObject;
  shadow: ThemeObject;
  overlay: ThemeObject;
  mode: string;

  // Allow additional properties - using any for maximum flexibility
  [key: string]: any;
}

export interface ThemedProps {
  theme: BrunoTheme;
}
