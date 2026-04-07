import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type LogType = 'info' | 'warn' | 'error' | 'debug' | 'log';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
type LogTab = 'console' | 'network' | 'debug';

interface LogEntry {
  id: number;
  type: LogType;
  message: string;
  args: unknown[];
  timestamp: string;
}

interface DebugError {
  id: number;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  args: unknown[];
  timestamp: string;
}

interface LogFilters {
  info: boolean;
  warn: boolean;
  error: boolean;
  debug: boolean;
  log: boolean;
}

interface NetworkFilters {
  GET: boolean;
  POST: boolean;
  PUT: boolean;
  DELETE: boolean;
  PATCH: boolean;
  HEAD: boolean;
  OPTIONS: boolean;
}

interface LogsState {
  logs: LogEntry[];
  debugErrors: DebugError[];
  isConsoleOpen: boolean;
  activeTab: LogTab;
  filters: LogFilters;
  networkFilters: NetworkFilters;
  selectedRequest: unknown | null;
  selectedError: DebugError | null;
  maxLogs: number;
  maxDebugErrors: number;
}

const initialState: LogsState = {
  logs: [],
  debugErrors: [],
  isConsoleOpen: false,
  activeTab: 'console',
  filters: {
    info: true,
    warn: true,
    error: true,
    debug: true,
    log: true
  },
  networkFilters: {
    GET: true,
    POST: true,
    PUT: true,
    DELETE: true,
    PATCH: true,
    HEAD: true,
    OPTIONS: true
  },
  selectedRequest: null,
  selectedError: null,
  maxLogs: 1000,
  maxDebugErrors: 500
};

export const logsSlice = createSlice({
  name: 'logs',
  initialState,
  reducers: {
    addLog: (state, action: PayloadAction<{ type?: LogType; args?: unknown[]; timestamp?: string }>) => {
      const { type, args, timestamp } = action.payload;
      const newLog: LogEntry = {
        id: Date.now() + Math.random(),
        type: type || 'log',
        message: args ? args.join(' ') : '',
        args: args || [],
        timestamp: timestamp || new Date().toISOString()
      };

      state.logs.push(newLog);

      if (state.logs.length > state.maxLogs) {
        state.logs = state.logs.slice(-state.maxLogs);
      }
    },
    addDebugError: (state, action: PayloadAction<{
      message?: string;
      stack?: string;
      filename?: string;
      lineno?: number;
      colno?: number;
      args?: unknown[];
      timestamp?: string;
    }>) => {
      const { message, stack, filename, lineno, colno, args, timestamp } = action.payload;
      const newError: DebugError = {
        id: Date.now() + Math.random(),
        message: message || 'Unknown error',
        stack: stack,
        filename: filename,
        lineno: lineno,
        colno: colno,
        args: args || [],
        timestamp: timestamp || new Date().toISOString()
      };

      state.debugErrors.push(newError);

      if (state.debugErrors.length > state.maxDebugErrors) {
        state.debugErrors = state.debugErrors.slice(-state.maxDebugErrors);
      }
    },
    clearLogs: (state) => {
      state.logs = [];
    },
    clearDebugErrors: (state) => {
      state.debugErrors = [];
    },
    openConsole: (state) => {
      state.isConsoleOpen = true;
    },
    closeConsole: (state) => {
      state.isConsoleOpen = false;
    },
    setActiveTab: (state, action: PayloadAction<LogTab>) => {
      state.activeTab = action.payload;
      if (action.payload !== 'network') {
        state.selectedRequest = null;
      }
      if (action.payload !== 'debug') {
        state.selectedError = null;
      }
    },
    updateFilter: (state, action: PayloadAction<{ filterType: LogType; enabled: boolean }>) => {
      const { filterType, enabled } = action.payload;
      state.filters[filterType] = enabled;
    },
    toggleAllFilters: (state, action: PayloadAction<boolean>) => {
      const enabled = action.payload;
      (Object.keys(state.filters) as LogType[]).forEach((key) => {
        state.filters[key] = enabled;
      });
    },
    updateNetworkFilter: (state, action: PayloadAction<{ method: HttpMethod; enabled: boolean }>) => {
      const { method, enabled } = action.payload;
      state.networkFilters[method] = enabled;
    },
    toggleAllNetworkFilters: (state, action: PayloadAction<boolean>) => {
      const enabled = action.payload;
      (Object.keys(state.networkFilters) as HttpMethod[]).forEach((key) => {
        state.networkFilters[key] = enabled;
      });
    },
    setSelectedRequest: (state, action: PayloadAction<unknown>) => {
      state.selectedRequest = action.payload;
    },
    clearSelectedRequest: (state) => {
      state.selectedRequest = null;
    },
    setSelectedError: (state, action: PayloadAction<DebugError | null>) => {
      state.selectedError = action.payload;
    },
    clearSelectedError: (state) => {
      state.selectedError = null;
    }
  }
});

export const {
  addLog,
  addDebugError,
  clearLogs,
  clearDebugErrors,
  openConsole,
  closeConsole,
  setActiveTab,
  updateFilter,
  toggleAllFilters,
  updateNetworkFilter,
  toggleAllNetworkFilters,
  setSelectedRequest,
  clearSelectedRequest,
  setSelectedError,
  clearSelectedError
} = logsSlice.actions;

export default logsSlice.reducer;
