import * as os from 'os';

export class FirefoxOptions {
  private _browserPath: string;
  private _address: string = '127.0.0.1';
  private _port: number = 9222;
  private _profilePath: string | null = null;
  private _arguments: string[] = [];
  private _preferences: Record<string, unknown> = {};
  private _headless: boolean = false;
  private _downloadPath: string = '.';
  private _loadMode: 'normal' | 'eager' | 'none' = 'normal';
  private _timeouts: { base: number; pageLoad: number; script: number } = {
    base: 10,
    pageLoad: 30,
    script: 30,
  };
  private _existingOnly: boolean = false;
  private _proxy: string | null = null;
  private _autoPort: boolean = false;
  private _privateMode: boolean = false;
  private _windowWidth: number | null = null;
  private _windowHeight: number | null = null;

  constructor() {
    const platform = os.platform();
    if (platform === 'win32') {
      this._browserPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
    } else if (platform === 'darwin') {
      this._browserPath = '/Applications/Firefox.app/Contents/MacOS/firefox';
    } else {
      this._browserPath = 'firefox';
    }
  }

  // ===== Getters =====

  get browserPath(): string { return this._browserPath; }
  get address(): string { return `${this._address}:${this._port}`; }
  get host(): string { return this._address; }
  get port(): number { return this._port; }
  get profilePath(): string | null { return this._profilePath; }
  get arguments(): string[] { return [...this._arguments]; }
  get preferences(): Record<string, unknown> { return { ...this._preferences }; }
  get isHeadless(): boolean { return this._headless; }
  get downloadPath(): string { return this._downloadPath; }
  get loadMode(): 'normal' | 'eager' | 'none' { return this._loadMode; }
  get timeouts(): { base: number; pageLoad: number; script: number } { return { ...this._timeouts }; }
  get isExistingOnly(): boolean { return this._existingOnly; }
  get proxy(): string | null { return this._proxy; }
  get autoPort(): boolean { return this._autoPort; }
  get isPrivateMode(): boolean { return this._privateMode; }
  get windowWidth(): number | null { return this._windowWidth; }
  get windowHeight(): number | null { return this._windowHeight; }

  // ===== Fluent setters =====

  setBrowserPath(path: string): this {
    this._browserPath = path;
    return this;
  }

  setAddress(address: string): this {
    const lastColon = address.lastIndexOf(':');
    if (lastColon !== -1) {
      this._address = address.slice(0, lastColon);
      this._port = parseInt(address.slice(lastColon + 1), 10);
    } else {
      this._address = address;
    }
    return this;
  }

  setPort(port: number): this {
    this._port = port;
    return this;
  }

  setUserDir(path: string): this {
    this._profilePath = path;
    return this;
  }

  setProfile(path: string): this {
    this._profilePath = path;
    return this;
  }

  headless(value = true): this {
    this._headless = value;
    return this;
  }

  setProxy(proxy: string): this {
    this._proxy = proxy;
    return this;
  }

  setWindowSize(width: number, height: number): this {
    this._windowWidth = width;
    this._windowHeight = height;
    return this;
  }

  addArgument(arg: string): this {
    if (!this._arguments.includes(arg)) {
      this._arguments.push(arg);
    }
    return this;
  }

  setPreference(key: string, value: unknown): this {
    this._preferences[key] = value;
    return this;
  }

  setExistingOnly(value = true): this {
    this._existingOnly = value;
    return this;
  }

  setLoadMode(mode: 'normal' | 'eager' | 'none'): this {
    this._loadMode = mode;
    return this;
  }

  setTimeouts(base?: number, pageLoad?: number, script?: number): this {
    if (base !== undefined) this._timeouts.base = base;
    if (pageLoad !== undefined) this._timeouts.pageLoad = pageLoad;
    if (script !== undefined) this._timeouts.script = script;
    return this;
  }

  setAutoPort(value = true): this {
    this._autoPort = value;
    return this;
  }

  setPrivateMode(value = true): this {
    this._privateMode = value;
    return this;
  }

  quickStart(options: {
    headless?: boolean;
    private?: boolean;
    port?: number;
    browserPath?: string;
    userDir?: string;
    windowSize?: [number, number];
    timeoutBase?: number;
    timeoutPageLoad?: number;
    timeoutScript?: number;
  }): this {
    if (options.headless !== undefined) this.headless(options.headless);
    if (options.private !== undefined) this.setPrivateMode(options.private);
    if (options.port !== undefined) this.setPort(options.port);
    if (options.browserPath) this.setBrowserPath(options.browserPath);
    if (options.userDir) this.setUserDir(options.userDir);
    if (options.windowSize) this.setWindowSize(options.windowSize[0], options.windowSize[1]);
    if (options.timeoutBase !== undefined || options.timeoutPageLoad !== undefined || options.timeoutScript !== undefined) {
      this.setTimeouts(options.timeoutBase, options.timeoutPageLoad, options.timeoutScript);
    }
    return this;
  }
}
