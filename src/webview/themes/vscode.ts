/**
 * VS Code Integrated Theme
 *
 * Reads actual color values from VS Code CSS variables at runtime.
 * This ensures the Bruno UI matches the user's actual VS Code theme.
 */

/**
 * Read a CSS variable value from VS Code
 */
const getVSCodeColor = (varName: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--vscode-${varName}`).trim();
  return value || fallback;
};

const colorWithAlpha = (color: string, alpha: number): string => {
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Read all VS Code theme colors
 */
const readVSCodeColors = () => ({
  // Editor colors
  editorBg: getVSCodeColor('editor-background', '#1e1e1e'),
  editorFg: getVSCodeColor('editor-foreground', '#d4d4d4'),

  // Input colors
  inputBg: getVSCodeColor('input-background', '#3c3c3c'),
  inputFg: getVSCodeColor('input-foreground', '#cccccc'),
  inputBorder: getVSCodeColor('input-border', '#454545'),
  inputPlaceholder: getVSCodeColor('input-placeholderForeground', '#a0a0a0'),

  // Button colors
  buttonBg: getVSCodeColor('button-background', '#0e639c'),
  buttonFg: getVSCodeColor('button-foreground', '#ffffff'),
  buttonHoverBg: getVSCodeColor('button-hoverBackground', '#1177bb'),
  buttonSecondaryBg: getVSCodeColor('button-secondaryBackground', '#3a3d41'),
  buttonSecondaryFg: getVSCodeColor('button-secondaryForeground', '#ffffff'),

  // General foreground (used as fallback for sidebar/panel foreground)
  foreground: getVSCodeColor('foreground', '#cccccc'),

  // Sidebar/Panel colors
  sidebarBg: getVSCodeColor('sideBar-background', '#252526'),
  sidebarFg: getVSCodeColor('sideBar-foreground', '') || getVSCodeColor('foreground', '#cccccc'),
  panelBg: getVSCodeColor('panel-background', '#1e1e1e'),
  panelBorder: getVSCodeColor('panel-border', '#80808059'),

  // List colors
  listHoverBg: getVSCodeColor('list-hoverBackground', '#2a2d2e'),
  listActiveBg: getVSCodeColor('list-activeSelectionBackground', '#094771'),
  listActiveFg: getVSCodeColor('list-activeSelectionForeground', '#ffffff'),

  // Tab colors
  tabActiveBg: getVSCodeColor('tab-activeBackground', '#1e1e1e'),
  tabActiveFg: getVSCodeColor('tab-activeForeground', '#ffffff'),
  tabInactiveBg: getVSCodeColor('tab-inactiveBackground', '#2d2d2d'),
  tabInactiveFg: getVSCodeColor('tab-inactiveForeground', '#ffffff80'),
  tabBorder: getVSCodeColor('tab-border', '#252526'),

  // Focus/Selection
  focusBorder: getVSCodeColor('focusBorder', '#007fd4'),
  selectionBg: getVSCodeColor('editor-selectionBackground', '#264f78'),

  // Accent/Brand - use focusBorder as the accent color
  accent: getVSCodeColor('focusBorder', '#007fd4'),

  // Status colors
  infoFg: getVSCodeColor('editorInfo-foreground', '#3794ff'),
  warningFg: getVSCodeColor('editorWarning-foreground', '#cca700'),
  errorFg: getVSCodeColor('editorError-foreground', '#f14c4c'),
  successFg: getVSCodeColor('testing-iconPassed', '#4ec9b0'),

  // Border colors
  widgetBorder: getVSCodeColor('widget-border', '#454545'),
  editorGroupBorder: getVSCodeColor('editorGroup-border', '#444444'),
  contrastBorder: getVSCodeColor('contrastBorder', '#6fc3df'),
  tableBorder: getVSCodeColor('keybindingTable-rowsBackground', '#2a2d2e'),

  // Dropdown
  dropdownBg: getVSCodeColor('dropdown-background', '#3c3c3c'),
  dropdownFg: getVSCodeColor('dropdown-foreground', '#f0f0f0'),
  dropdownBorder: getVSCodeColor('dropdown-border', '#3c3c3c'),

  // Scrollbar
  scrollbarBg: getVSCodeColor('scrollbarSlider-background', 'rgba(121, 121, 121, 0.4)'),

  // Description/Muted text
  descriptionFg: getVSCodeColor('descriptionForeground', '#a0a0a0'),
  disabledFg: getVSCodeColor('disabledForeground', '#cccccc80'),

  // Badge
  badgeBg: getVSCodeColor('badge-background', '#4d4d4d'),
  badgeFg: getVSCodeColor('badge-foreground', '#ffffff'),

  // Notification
  notificationBg: getVSCodeColor('notifications-background', '#252526'),
  notificationFg: getVSCodeColor('notifications-foreground', '#cccccc'),

  // Text link
  textLinkFg: getVSCodeColor('textLink-foreground', '#3794ff'),
});

// HTTP Method colors (fixed, not from VS Code)
const methodColors = {
  get: '#4ec9b0',
  post: '#569cd6',
  put: '#ce9178',
  delete: '#f14c4c',
  patch: '#dcdcaa',
  options: '#4fc1ff',
  head: '#9cdcfe',
};

export const createVSCodeTheme = (mode: 'light' | 'dark') => {
  const colors = readVSCodeColors();

  const syntaxColors = mode === 'light'
    ? {
        keyword: '#0000ff',
        string: '#a31515',
        number: '#098658',
        variable: '#001080',
        property: '#001080',
        comment: '#008000',
        operator: '#000000',
        tag: '#800000',
      }
    : {
        keyword: '#569cd6',
        string: '#ce9178',
        number: '#b5cea8',
        variable: '#9cdcfe',
        property: '#9cdcfe',
        comment: '#6a9955',
        operator: '#d4d4d4',
        tag: '#569cd6',
      };

  return {
    mode: 'vscode',
    brand: colors.accent,
    text: colors.editorFg,
    textLink: colors.textLinkFg,
    draftColor: colors.warningFg,
    bg: colors.editorBg,

    // Required BrunoTheme properties
    textSecondary: colors.descriptionFg,
    danger: {
      color: colors.errorFg,
      bg: colors.errorFg,
    },

    primary: {
      solid: colors.accent,
      text: colors.accent,
      strong: colors.accent,
      subtle: colors.accent,
    },

    accents: {
      primary: colors.accent,
    },

    background: {
      base: colors.editorBg,
      mantle: colors.sidebarBg,
      crust: colors.panelBg,
      surface0: colors.listHoverBg,
      surface1: colors.inputBg,
      surface2: colors.badgeBg,
    },

    status: {
      info: {
        background: colors.infoFg,
        text: colors.infoFg,
        border: colors.infoFg,
      },
      success: {
        background: colors.successFg,
        text: colors.successFg,
        border: colors.successFg,
      },
      warning: {
        background: colors.warningFg,
        text: colors.warningFg,
        border: colors.warningFg,
      },
      danger: {
        background: colors.errorFg,
        text: colors.errorFg,
        border: colors.errorFg,
      },
    },

    overlay: {
      overlay2: colors.badgeBg,
      overlay1: colors.inputBg,
      overlay0: colors.sidebarBg,
    },

    font: {
      size: {
        xs: '0.6875rem',
        sm: '0.75rem',
        base: '0.8125rem',
        md: '0.875rem',
        lg: '1rem',
        xl: '1.125rem',
      },
    },

    shadow: {
      sm: mode === 'light'
        ? '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.12)'
        : '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
      md: mode === 'light'
        ? '0 3px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.08)'
        : '0 3px 6px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.12)',
      lg: mode === 'light'
        ? '0 10px 20px rgba(0, 0, 0, 0.1), 0 3px 6px rgba(0, 0, 0, 0.06)'
        : '0 10px 20px rgba(0, 0, 0, 0.15), 0 3px 6px rgba(0, 0, 0, 0.1)',
    },

    border: {
      radius: {
        sm: '4px',
        base: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      border2: colors.widgetBorder,
      border1: colors.panelBorder,
      border0: colors.editorGroupBorder,
    },

    colors: {
      text: {
        white: colors.editorFg,
        green: colors.successFg,
        danger: colors.errorFg,
        warning: colors.warningFg,
        muted: colors.descriptionFg,
        purple: mode === 'light' ? '#af00db' : '#c586c0',
        yellow: mode === 'light' ? '#795e26' : '#dcdcaa',
        subtext2: colors.descriptionFg,
        subtext1: colors.descriptionFg,
        subtext0: colors.disabledFg,
        link: colors.textLinkFg,
      },
      bg: {
        danger: colors.errorFg,
      },
      accent: colors.accent,
    },

    input: {
      bg: colors.inputBg,
      border: colors.inputBorder,
      focusBorder: colors.focusBorder,
      placeholder: {
        color: colors.inputPlaceholder,
        opacity: 1,
      },
    },

    sidebar: {
      color: colors.sidebarFg,
      muted: colors.descriptionFg,
      bg: colors.sidebarBg,
      dragbar: {
        border: colors.panelBorder,
        activeBorder: colors.focusBorder,
      },
      collection: {
        item: {
          bg: colors.sidebarBg,
          hoverBg: colors.listHoverBg,
          focusBorder: colors.focusBorder,
          indentBorder: `solid 1px ${colors.widgetBorder}`,
          active: {
            indentBorder: `solid 1px ${colors.focusBorder}`,
          },
          example: {
            iconColor: colors.sidebarFg,
          },
        },
      },
      dropdownIcon: {
        color: colors.sidebarFg,
      },
    },

    dropdown: {
      color: colors.editorFg,
      iconColor: colors.descriptionFg,
      bg: mode === 'light'
        ? colors.editorBg
        : colorWithAlpha(colors.sidebarBg, 1), // Slightly lighter than pure dropdown bg for dark mode
      hoverBg: mode === 'light'
        ? colorWithAlpha('#000000', 0.06)
        : colorWithAlpha('#ffffff', 0.08),
      shadow: mode === 'light'
        ? '0 4px 12px rgba(0, 0, 0, 0.15)'
        : '0 4px 12px rgba(0, 0, 0, 0.4)',
      border: mode === 'light'
        ? colorWithAlpha('#000000', 0.12)
        : colorWithAlpha('#ffffff', 0.12),
      separator: colors.widgetBorder,
      selectedColor: mode === 'light' ? '#0066cc' : '#58a6ff', // Bright blue for better visibility
      focusRing: colors.focusBorder,
      mutedText: colors.descriptionFg,
    },

    workspace: {
      accent: colors.accent,
      border: colors.widgetBorder,
      button: {
        bg: colors.buttonSecondaryBg,
      },
    },

    request: {
      methods: methodColors,
      grpc: '#4fc1ff',
      ws: '#ce9178',
      gql: mode === 'light' ? '#af00db' : '#c586c0',
    },

    requestTabPanel: {
      url: {
        bg: colors.editorBg,
        icon: colors.editorFg,
        iconDanger: colors.errorFg,
        border: `solid 1px ${colors.widgetBorder}`,
      },
      dragbar: {
        border: colors.panelBorder,
        activeBorder: colors.focusBorder,
      },
      responseStatus: colors.editorFg,
      responseOk: colors.successFg,
      responseError: colors.errorFg,
      responsePending: colors.infoFg,
      responseOverlayBg: mode === 'light' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.5)',
      card: {
        bg: colors.sidebarBg,
        border: 'transparent',
        hr: colors.widgetBorder,
      },
      graphqlDocsExplorer: {
        bg: colors.editorBg,
        color: colors.editorFg,
      },
    },

    notifications: {
      bg: colors.notificationBg,
      list: {
        bg: colors.notificationBg,
        borderRight: colors.widgetBorder,
        borderBottom: colors.widgetBorder,
        hoverBg: colors.listHoverBg,
        active: {
          border: colors.focusBorder,
          bg: colors.listActiveBg,
          hoverBg: colors.listActiveBg,
        },
      },
    },

    modal: {
      title: {
        color: colors.editorFg,
        bg: colors.editorBg,
      },
      body: {
        color: colors.editorFg,
        bg: colors.sidebarBg,
      },
      input: {
        bg: colors.inputBg,
        border: colors.inputBorder,
        focusBorder: colors.focusBorder,
      },
      backdrop: {
        opacity: mode === 'light' ? 0.3 : 0.5,
      },
    },

    button: {
      secondary: {
        color: colors.buttonSecondaryFg,
        bg: colors.buttonSecondaryBg,
        border: colors.buttonSecondaryBg,
        hoverBorder: colors.widgetBorder,
      },
      close: {
        color: colors.editorFg,
        bg: 'transparent',
        border: 'transparent',
        hoverBorder: '',
      },
      disabled: {
        color: colors.disabledFg,
        bg: colors.buttonSecondaryBg,
        border: colors.buttonSecondaryBg,
      },
      danger: {
        color: '#ffffff',
        bg: colors.errorFg,
        border: colors.errorFg,
      },
    },

    button2: {
      color: {
        primary: {
          bg: colors.buttonBg,
          text: colors.buttonFg,
          border: colors.buttonBg,
        },
        light: {
          bg: colors.listHoverBg,
          text: colors.accent,
          border: 'transparent',
        },
        secondary: {
          bg: colors.buttonSecondaryBg,
          text: colors.buttonSecondaryFg,
          border: colors.widgetBorder,
        },
        success: {
          bg: colors.successFg,
          text: '#ffffff',
          border: colors.successFg,
        },
        warning: {
          bg: colors.warningFg,
          text: mode === 'light' ? '#ffffff' : '#000000',
          border: colors.warningFg,
        },
        danger: {
          bg: colors.errorFg,
          text: '#ffffff',
          border: colors.errorFg,
        },
      },
    },

    tabs: {
      marginRight: '1.2rem',
      active: {
        fontWeight: 400,
        color: colors.tabActiveFg,
        border: colors.accent,
      },
      secondary: {
        active: {
          bg: colors.tabActiveBg,
          color: colors.tabActiveFg,
        },
        inactive: {
          bg: colors.tabInactiveBg,
          color: colors.tabInactiveFg,
        },
      },
    },

    requestTabs: {
      color: colors.editorFg,
      bg: colors.tabInactiveBg,
      bottomBorder: colors.tabBorder,
      icon: {
        color: colors.descriptionFg,
        hoverColor: colors.editorFg,
        hoverBg: colors.listHoverBg,
      },
      example: {
        iconColor: colors.descriptionFg,
      },
    },

    codemirror: {
      bg: colors.editorBg,
      border: colors.editorBg,
      placeholder: {
        color: colors.inputPlaceholder,
        opacity: 0.7,
      },
      gutter: {
        bg: colors.editorBg,
      },
      variable: {
        valid: colors.successFg,
        invalid: colors.errorFg,
        prompt: colors.infoFg,
      },
      tokens: {
        definition: syntaxColors.variable,
        property: syntaxColors.property,
        string: syntaxColors.string,
        number: syntaxColors.number,
        atom: syntaxColors.keyword,
        variable: syntaxColors.variable,
        keyword: syntaxColors.keyword,
        comment: syntaxColors.comment,
        operator: syntaxColors.operator,
        tag: syntaxColors.tag,
        tagBracket: syntaxColors.operator,
      },
      searchLineHighlightCurrent: mode === 'light' ? 'rgba(150, 150, 150, 0.18)' : 'rgba(120, 120, 120, 0.18)',
      searchMatch: '#ffd700',
      searchMatchActive: '#ffff00',
    },

    table: {
      border: colors.editorGroupBorder,
      thead: {
        color: colors.editorFg,
      },
      striped: colors.listHoverBg,
      input: {
        color: colors.editorFg,
      },
    },

    plainGrid: {
      hoverBg: colors.listHoverBg,
    },

    scrollbar: {
      color: colors.scrollbarBg,
    },

    dragAndDrop: {
      border: colors.focusBorder,
      borderStyle: '2px dashed',
      hoverBg: colors.listHoverBg,
      transition: 'all 0.1s ease',
    },

    infoTip: {
      bg: colors.notificationBg,
      border: colors.widgetBorder,
      boxShadow: mode === 'light' ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
    },

    statusBar: {
      border: colors.widgetBorder,
      color: colors.descriptionFg,
    },

    console: {
      bg: colors.panelBg,
      headerBg: colors.sidebarBg,
      contentBg: colors.panelBg,
      border: colors.widgetBorder,
      titleColor: colors.editorFg,
      countColor: colors.descriptionFg,
      buttonColor: colors.editorFg,
      buttonHoverBg: colors.listHoverBg,
      buttonHoverColor: colors.editorFg,
      messageColor: colors.editorFg,
      timestampColor: colors.descriptionFg,
      emptyColor: colors.descriptionFg,
      logHoverBg: colors.listHoverBg,
      resizeHandleHover: colors.focusBorder,
      resizeHandleActive: colors.focusBorder,
      dropdownBg: colors.dropdownBg,
      dropdownHeaderBg: colors.sidebarBg,
      optionHoverBg: colors.listHoverBg,
      optionLabelColor: colors.editorFg,
      optionCountColor: colors.descriptionFg,
      checkboxColor: colors.accent,
      scrollbarTrack: colors.sidebarBg,
      scrollbarThumb: colors.badgeBg,
      scrollbarThumbHover: colors.inputBg,
    },

    grpc: {
      tabNav: {
        container: {
          bg: colors.sidebarBg,
        },
        button: {
          active: {
            bg: colors.listActiveBg,
            color: colors.listActiveFg,
          },
          inactive: {
            bg: 'transparent',
            color: colors.descriptionFg,
          },
        },
      },
      importPaths: {
        header: {
          text: colors.descriptionFg,
          button: {
            color: colors.descriptionFg,
            hoverColor: colors.editorFg,
          },
        },
        error: {
          bg: 'transparent',
          text: colors.errorFg,
          link: {
            color: colors.errorFg,
            hoverColor: colors.errorFg,
          },
        },
        item: {
          bg: 'transparent',
          hoverBg: colors.listHoverBg,
          text: colors.editorFg,
          icon: colors.descriptionFg,
          checkbox: {
            color: colors.editorFg,
          },
          invalid: {
            opacity: 0.6,
            text: colors.errorFg,
          },
        },
        empty: {
          text: colors.descriptionFg,
        },
        button: {
          bg: colors.buttonBg,
          color: colors.buttonFg,
          border: colors.buttonBg,
          hoverBorder: colors.buttonHoverBg,
        },
      },
      protoFiles: {
        header: {
          text: colors.descriptionFg,
          button: {
            color: colors.descriptionFg,
            hoverColor: colors.editorFg,
          },
        },
        error: {
          bg: 'transparent',
          text: colors.errorFg,
          link: {
            color: colors.errorFg,
            hoverColor: colors.errorFg,
          },
        },
        item: {
          bg: 'transparent',
          hoverBg: colors.listHoverBg,
          selected: {
            bg: colors.listHoverBg,
            border: colors.accent,
          },
          text: colors.editorFg,
          secondaryText: colors.descriptionFg,
          icon: colors.descriptionFg,
          invalid: {
            opacity: 0.6,
            text: colors.errorFg,
          },
        },
        empty: {
          text: colors.descriptionFg,
        },
        button: {
          bg: colors.buttonBg,
          color: colors.buttonFg,
          border: colors.buttonBg,
          hoverBorder: colors.buttonHoverBg,
        },
      },
    },

    deprecationWarning: {
      bg: colors.listHoverBg,
      border: colors.errorFg,
      icon: colors.errorFg,
      text: colors.descriptionFg,
    },

    examples: {
      buttonBg: colors.listHoverBg,
      buttonColor: colors.accent,
      buttonText: colors.editorFg,
      buttonIconColor: colors.editorFg,
      border: colors.widgetBorder,
      urlBar: {
        border: colors.widgetBorder,
        bg: colors.inputBg,
      },
      table: {
        thead: {
          bg: colors.sidebarBg,
          color: colors.descriptionFg,
        },
      },
      checkbox: {
        color: colors.editorFg,
      },
    },

    app: {
      collection: {
        toolbar: {
          environmentSelector: {
            bg: colors.editorBg,
            border: colors.widgetBorder,
            icon: colors.accent,
            text: colors.editorFg,
            caret: colors.descriptionFg,
            separator: colors.widgetBorder,
            hoverBg: colors.listHoverBg,
            hoverBorder: colors.widgetBorder,
            noEnvironment: {
              text: colors.descriptionFg,
              bg: colors.editorBg,
              border: colors.widgetBorder,
              hoverBg: colors.listHoverBg,
              hoverBorder: colors.widgetBorder,
            },
          },
          sandboxMode: {
            safeMode: {
              bg: colorWithAlpha(colors.successFg, 0.15),
              color: colors.successFg,
            },
            developerMode: {
              bg: colorWithAlpha(colors.warningFg, 0.15),
              color: colors.warningFg,
            },
          },
        },
      },
    },
  };
};

// Default export for backward compatibility
const vscodeTheme = createVSCodeTheme('dark');
export default vscodeTheme;
