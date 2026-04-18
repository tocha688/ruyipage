import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ChildProcess, spawn } from 'child_process';
import { BrowserBiDiDriver, ContextDriver } from './driver';
import { FirefoxOptions } from '../config/firefoxOptions';
import { BrowserConnectError, BrowserLaunchError } from '../errors';
import * as bidiSession from '../bidi/session';
import * as bidiContext from '../bidi/browsingContext';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result: boolean) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host);
  });
}

function httpGet(url: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getBiDiWsUrl(host: string, port: number, timeoutMs = 30000): Promise<string> {
  const sessionWs = `ws://${host}:${port}/session`;
  const directWs = `ws://${host}:${port}`;
  const deadline = Date.now() + timeoutMs;

  // First try the direct ws URL quickly
  const jsonUrl = `http://${host}:${port}/json`;

  while (Date.now() < deadline) {
    try {
      const body = await httpGet(jsonUrl, 2000);
      const data = JSON.parse(body) as Record<string, unknown>;
      if (typeof data['webSocketDebuggerUrl'] === 'string') {
        return data['webSocketDebuggerUrl'] as string;
      }
      // Some browsers return direct ws
      return directWs;
    } catch {
      // Not ready yet
    }
    await sleep(500);
  }

  return sessionWs;
}

async function waitForPort(host: string, port: number, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(host, port, 1000)) return;
    await sleep(300);
  }
  throw new BrowserConnectError(`Timed out waiting for port ${host}:${port}`);
}

function findFreePort(start = 9222, end = 9322): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number) => {
      if (p > end) { reject(new Error(`No free port in [${start}, ${end}]`)); return; }
      const server = net.createServer();
      server.listen(p, '127.0.0.1', () => {
        server.close(() => resolve(p));
      });
      server.on('error', () => tryPort(p + 1));
    };
    tryPort(start);
  });
}

export class Firefox {
  private static _BROWSERS: Map<string, Firefox> = new Map();

  private _options: FirefoxOptions;
  private _driver: BrowserBiDiDriver;
  private _process: ChildProcess | null = null;
  private _contextIds: string[] = [];
  private _autoProfile: string | null = null;
  private _ownsSession: boolean = false;

  get driver(): BrowserBiDiDriver {
    return this._driver;
  }

  get options(): FirefoxOptions {
    return this._options;
  }

  get address(): string {
    return this._options.address;
  }

  get tabIds(): string[] {
    return [...this._contextIds];
  }

  get tabsCount(): number {
    return this._contextIds.length;
  }

  private constructor(opts: FirefoxOptions, driver: BrowserBiDiDriver) {
    this._options = opts;
    this._driver = driver;
  }

  static async create(opts: FirefoxOptions): Promise<Firefox> {
    const existingBrowser = Firefox._BROWSERS.get(opts.address);
    if (existingBrowser && existingBrowser._driver.isRunning) {
      return existingBrowser;
    }

    const driver = new BrowserBiDiDriver(opts.address);
    const browser = new Firefox(opts, driver);

    if (opts.isExistingOnly) {
      // Attach to existing browser
      await browser._attach();
    } else {
      await browser._launch();
    }

    Firefox._BROWSERS.set(opts.address, browser);
    return browser;
  }

  private async _attach(): Promise<void> {
    const host = this._options.host;
    const port = this._options.port;

    // Check if port is reachable
    const open = await isPortOpen(host, port, 2000);
    if (!open) {
      throw new BrowserConnectError(`Cannot connect to ${host}:${port}`);
    }

    const wsUrl = await getBiDiWsUrl(host, port, 5000);
    await this._driver.start(wsUrl);

    const result = await bidiSession.new_(this._driver, {});
    this._driver.sessionId = (result['sessionId'] as string) || null;
    this._ownsSession = true;

    await this._refreshContextIds();
  }

  private async _launch(): Promise<void> {
    const opts = this._options;
    const host = opts.host;
    let port = opts.port;

    if (opts.autoPort) {
      port = await findFreePort();
    }

    // Create temp profile if needed
    let profilePath = opts.profilePath;
    if (!profilePath) {
      this._autoProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'ruyi-ff-'));
      profilePath = this._autoProfile;
    }

    const args = [
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      '--no-remote',
    ];

    if (profilePath) {
      args.push('-profile', profilePath);
    }
    if (opts.isHeadless) {
      args.push('--headless');
    }
    if (opts.isPrivateMode) {
      args.push('-private-window', 'about:blank');
    }
    if (opts.windowWidth && opts.windowHeight) {
      args.push(`--window-size=${opts.windowWidth},${opts.windowHeight}`);
    }
    args.push(...opts.arguments);

    // Write user.js preferences
    if (Object.keys(opts.preferences).length > 0 && profilePath) {
      const userJsPath = path.join(profilePath, 'user.js');
      const prefLines = Object.entries(opts.preferences).map(([k, v]) => {
        const val = typeof v === 'string' ? `"${v}"` : String(v);
        return `user_pref("${k}", ${val});`;
      });
      fs.writeFileSync(userJsPath, prefLines.join('\n'), 'utf8');
    }

    try {
      this._process = spawn(opts.browserPath, args, {
        detached: false,
        stdio: 'ignore',
      });

      this._process.on('error', (err) => {
        throw new BrowserLaunchError(`Failed to launch Firefox: ${err.message}`);
      });
    } catch (e) {
      throw new BrowserLaunchError(`Failed to start Firefox process: ${e}`);
    }

    // Wait for port to be open
    await waitForPort(host, port, 30000);

    // Get WS URL and connect
    const wsUrl = await getBiDiWsUrl(host, port, 15000);
    await this._driver.start(wsUrl);

    // Create BiDi session
    const result = await bidiSession.new_(this._driver, {});
    this._driver.sessionId = (result['sessionId'] as string) || null;
    this._ownsSession = true;

    await this._refreshContextIds();
  }

  private async _refreshContextIds(): Promise<void> {
    try {
      const result = await bidiContext.getTree(this._driver);
      const contexts = (result['contexts'] as Array<Record<string, unknown>>) || [];
      this._contextIds = contexts.map(c => c['context'] as string).filter(Boolean);
    } catch {
      this._contextIds = [];
    }
  }

  getContextDriver(contextId: string): ContextDriver {
    return new ContextDriver(this._driver, contextId);
  }

  async newTab(url?: string, background = false): Promise<string> {
    const result = await bidiContext.create(
      this._driver,
      'tab',
      this._contextIds[0],
      background
    );
    const contextId = result['context'] as string;
    if (!this._contextIds.includes(contextId)) {
      this._contextIds.push(contextId);
    }
    if (url) {
      await bidiContext.navigate(this._driver, contextId, url, 'complete');
    }
    return contextId;
  }

  async getTab(idOrNum?: string | number, title?: string, url?: string): Promise<string> {
    await this._refreshContextIds();

    if (idOrNum !== undefined) {
      if (typeof idOrNum === 'number') {
        const idx = idOrNum - 1;
        if (idx >= 0 && idx < this._contextIds.length) {
          return this._contextIds[idx];
        }
        throw new Error(`Tab index ${idOrNum} out of range`);
      } else {
        if (this._contextIds.includes(idOrNum)) return idOrNum;
        throw new Error(`Tab id ${idOrNum} not found`);
      }
    }

    if (title || url) {
      const result = await bidiContext.getTree(this._driver);
      const contexts = (result['contexts'] as Array<Record<string, unknown>>) || [];
      for (const ctx of contexts) {
        const ctxId = ctx['context'] as string;
        const ctxUrl = (ctx['url'] as string) || '';
        if (url && ctxUrl.includes(url)) return ctxId;
        if (title) {
          // Would need to check title via script
          const ctxDriver = this.getContextDriver(ctxId);
          try {
            const r = await ctxDriver.run('script.evaluate', {
              expression: 'document.title',
              awaitPromise: false,
              resultOwnership: 'none',
            });
            const t = ((r['result'] as Record<string, unknown>)?.['value'] as string) || '';
            if (t.includes(title)) return ctxId;
          } catch { /* skip */ }
        }
      }
      throw new Error(`Tab not found with title="${title}" url="${url}"`);
    }

    // Return first tab
    if (this._contextIds.length === 0) {
      throw new Error('No tabs available');
    }
    return this._contextIds[0];
  }

  async activateTab(contextId: string): Promise<void> {
    await bidiContext.activate(this._driver, contextId);
  }

  async closeTab(contextId: string): Promise<void> {
    try {
      await bidiContext.close(this._driver, contextId);
    } catch { /* ignore */ }
    this._contextIds = this._contextIds.filter(id => id !== contextId);
  }

  async quit(timeoutMs = 5000, force = false): Promise<void> {
    try {
      if (this._ownsSession && this._driver.isRunning) {
        await bidiSession.end(this._driver);
      }
    } catch { /* ignore */ }

    this._driver.stop();
    Firefox._BROWSERS.delete(this.address);

    if (this._process) {
      const proc = this._process;
      await new Promise<void>(resolve => {
        const t = setTimeout(() => {
          if (force) proc.kill('SIGKILL');
          resolve();
        }, timeoutMs);
        proc.once('exit', () => { clearTimeout(t); resolve(); });
        proc.kill('SIGTERM');
      });
      this._process = null;
    }

    // Clean up auto-created profile
    if (this._autoProfile) {
      try { fs.rmSync(this._autoProfile, { recursive: true, force: true }); } catch { /* ignore */ }
      this._autoProfile = null;
    }
  }
}
