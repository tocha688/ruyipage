import WebSocket from 'ws';
import { BiDiError } from '../errors';

interface BiDiMessage {
  id?: number;
  type?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  message?: string;
  stacktrace?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout | null;
}

export class BrowserBiDiDriver {
  static _BROWSERS: Map<string, BrowserBiDiDriver> = new Map();

  address: string;
  sessionId: string | null = null;
  alertFlag: boolean = false;

  private _ws: WebSocket | null = null;
  private _curId: number = 0;
  private _isRunning: boolean = false;
  private _closing: boolean = false;
  private _methodResults: Map<number, PendingRequest> = new Map();
  private _eventHandlers: Map<string, (params: Record<string, unknown>) => void> = new Map();
  private _immediateEventHandlers: Map<string, (params: Record<string, unknown>) => void> = new Map();

  static getInstance(address: string): BrowserBiDiDriver {
    if (!this._BROWSERS.has(address)) {
      this._BROWSERS.set(address, new BrowserBiDiDriver(address));
    }
    return this._BROWSERS.get(address)!;
  }

  constructor(address: string) {
    this.address = address;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(wsUrl?: string): Promise<void> {
    if (this._isRunning) return;
    const url = wsUrl || `ws://${this.address}/session`;

    return new Promise((resolve, reject) => {
      this._ws = new WebSocket(url, { origin: '' });

      this._ws.on('open', () => {
        this._isRunning = true;
        this._closing = false;
        resolve();
      });

      this._ws.on('error', (err: Error) => {
        if (!this._isRunning) reject(err);
      });

      this._ws.on('message', (data: WebSocket.RawData) => {
        this._handleMessage(data.toString());
      });

      this._ws.on('close', () => {
        this._isRunning = false;
        for (const [, { reject: rej, timer }] of this._methodResults) {
          if (timer) clearTimeout(timer);
          rej(new Error('WebSocket connection closed'));
        }
        this._methodResults.clear();
      });
    });
  }

  stop(): void {
    this._closing = true;
    this._isRunning = false;
    if (this._ws) {
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
    BrowserBiDiDriver._BROWSERS.delete(this.address);
    for (const [, { reject: rej, timer }] of this._methodResults) {
      if (timer) clearTimeout(timer);
      rej(new Error('WebSocket closed'));
    }
    this._methodResults.clear();
  }

  markClosing(): void {
    this._closing = true;
  }

  get isClosing(): boolean {
    return this._closing;
  }

  private _handleMessage(raw: string): void {
    let msg: BiDiMessage;
    try {
      msg = JSON.parse(raw) as BiDiMessage;
    } catch {
      return;
    }

    // command response
    if (msg.id !== undefined && msg.id !== null) {
      const pending = this._methodResults.get(msg.id);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        this._methodResults.delete(msg.id);
        if (msg.type === 'error' || msg.error) {
          pending.reject(new BiDiError(msg.error || 'unknown', msg.message || '', msg.stacktrace || ''));
        } else {
          pending.resolve(msg.result || {});
        }
      }
      return;
    }

    // event message
    if (msg.type === 'event' || msg.method) {
      const eventMethod = msg.method || '';
      const eventParams = msg.params || {};
      const eventContext = eventParams['context'] as string | undefined;

      if (eventMethod === 'browsingContext.userPromptOpened') this.alertFlag = true;
      else if (eventMethod === 'browsingContext.userPromptClosed') this.alertFlag = false;

      // immediate handlers (dispatched asynchronously but before normal handlers)
      const immKey1 = `${eventMethod}::${eventContext || ''}`;
      const immKey2 = `${eventMethod}::`;
      for (const [key, handler] of this._immediateEventHandlers) {
        if (key === immKey1 || (!eventContext && key === immKey2) || (eventContext && key === immKey2)) {
          const h = handler;
          const p = eventParams;
          setImmediate(() => { try { h(p); } catch { /* ignore */ } });
        }
      }

      // normal event handlers
      for (const [key, handler] of this._eventHandlers) {
        if (key === immKey1 || key === immKey2) {
          try { handler(eventParams); } catch (e) { console.error('Event handler error:', e); }
        }
      }
    }
  }

  async run(method: string, params: Record<string, unknown> = {}, timeout?: number): Promise<Record<string, unknown>> {
    if (!this._isRunning) throw new Error('WebSocket not connected');

    const timeoutMs = (timeout ?? 30) * 1000;
    this._curId++;
    const cmdId = this._curId;

    const msg = JSON.stringify({ id: cmdId, method, params });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._methodResults.delete(cmdId);
        reject(new Error(`Command timeout: ${method} (${timeoutMs / 1000}s)`));
      }, timeoutMs);

      this._methodResults.set(cmdId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });

      try {
        this._ws!.send(msg);
      } catch (e) {
        clearTimeout(timer);
        this._methodResults.delete(cmdId);
        reject(e);
      }
    });
  }

  setCallback(
    event: string,
    callback: ((params: Record<string, unknown>) => void) | null,
    context?: string,
    immediate = false
  ): void {
    const key = `${event}::${context || ''}`;
    const handlers = immediate ? this._immediateEventHandlers : this._eventHandlers;
    if (callback === null) {
      handlers.delete(key);
    } else {
      handlers.set(key, callback);
    }
  }

  removeCallback(event: string, context?: string, immediate = false): void {
    this.setCallback(event, null, context, immediate);
  }
}

export class ContextDriver {
  _browserDriver: BrowserBiDiDriver;
  contextId: string;

  constructor(browserDriver: BrowserBiDiDriver, contextId: string) {
    this._browserDriver = browserDriver;
    this.contextId = contextId;
  }

  get isRunning(): boolean {
    return this._browserDriver.isRunning;
  }

  get alertFlag(): boolean {
    return this._browserDriver.alertFlag;
  }

  async run(method: string, params: Record<string, unknown> = {}, timeout?: number): Promise<Record<string, unknown>> {
    const p = { ...params };

    if (
      (method.startsWith('browsingContext.') ||
        method.startsWith('input.') ||
        method.startsWith('emulation.')) &&
      !p['context']
    ) {
      p['context'] = this.contextId;
    } else if (['script.evaluate', 'script.callFunction'].includes(method)) {
      if (!p['target']) {
        p['target'] = { context: this.contextId };
      } else {
        const t = p['target'] as Record<string, unknown>;
        if (!t['context']) t['context'] = this.contextId;
      }
    } else if (
      ['storage.getCookies', 'storage.setCookie', 'storage.deleteCookies'].includes(method)
    ) {
      if (!p['partition']) {
        p['partition'] = { type: 'context', context: this.contextId };
      }
    }

    return this._browserDriver.run(method, p, timeout);
  }

  setCallback(
    event: string,
    callback: ((params: Record<string, unknown>) => void) | null,
    immediate = false
  ): void {
    this._browserDriver.setCallback(event, callback, this.contextId, immediate);
  }

  setGlobalCallback(
    event: string,
    callback: ((params: Record<string, unknown>) => void) | null,
    immediate = false
  ): void {
    this._browserDriver.setCallback(event, callback, undefined, immediate);
  }

  removeCallback(event: string, immediate = false): void {
    this._browserDriver.removeCallback(event, this.contextId, immediate);
  }
}
