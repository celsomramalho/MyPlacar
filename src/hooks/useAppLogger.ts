import { useState, useEffect } from 'react';

export interface LogEntry {
  type: 'log' | 'error' | 'warn';
  msg: string;
  time: string;
}

export function useAppLogger() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: LogEntry['type'], args: unknown[]) => {
      const msg = args.map(arg => {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack}`;
        return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
      }).join(' ');
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [{ type, msg, time }, ...prev].slice(0, 100));
    };

    console.log = (...args) => { addLog('log', args); originalLog(...args); };
    console.error = (...args) => { addLog('error', args); originalError(...args); };
    console.warn = (...args) => { addLog('warn', args); originalWarn(...args); };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}
