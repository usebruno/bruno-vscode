import * as vscode from 'vscode';

export type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: LogLevel;
  args: unknown[];
}

class LogsStore {
  private static instance: LogsStore;
  private logs: LogEntry[] = [];
  private _onLogsChanged = new vscode.EventEmitter<void>();
  readonly onLogsChanged = this._onLogsChanged.event;
  private readonly maxLogs = 5000;

  private constructor() {}

  static getInstance(): LogsStore {
    if (!LogsStore.instance) {
      LogsStore.instance = new LogsStore();
    }
    return LogsStore.instance;
  }

  addLog(type: LogLevel, args: unknown[]): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      type,
      args
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    this._onLogsChanged.fire();
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this._onLogsChanged.fire();
  }
}

export default LogsStore.getInstance();
