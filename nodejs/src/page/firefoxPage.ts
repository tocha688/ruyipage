import { FirefoxBase } from './firefoxBase';
import { Firefox } from '../core/browser';
import { FirefoxOptions } from '../config/firefoxOptions';

export class FirefoxPage extends FirefoxBase {
  private static _PAGES: Map<string, FirefoxPage> = new Map();
  _firefox: Firefox;

  constructor(firefox: Firefox, contextId: string) {
    super();
    this._firefox = firefox;
    this._initContext(firefox, contextId);
  }

  static async create(addrOrOpts?: string | FirefoxOptions): Promise<FirefoxPage> {
    let opts: FirefoxOptions;

    if (typeof addrOrOpts === 'string') {
      opts = new FirefoxOptions().setAddress(addrOrOpts).setExistingOnly(true);
    } else if (addrOrOpts instanceof FirefoxOptions) {
      opts = addrOrOpts;
    } else {
      opts = new FirefoxOptions();
    }

    const existing = FirefoxPage._PAGES.get(opts.address);
    if (existing && existing._driver.isRunning) {
      return existing;
    }

    const firefox = await Firefox.create(opts);
    const contextId = await firefox.getTab();
    const page = new FirefoxPage(firefox, contextId);
    FirefoxPage._PAGES.set(opts.address, page);
    return page;
  }

  get tabsCount(): Promise<number> {
    return Promise.resolve(this._firefox.tabsCount);
  }

  get tabIds(): string[] {
    return this._firefox.tabIds;
  }

  async newTab(url?: string, background = false): Promise<FirefoxBase> {
    const contextId = await this._firefox.newTab(url, background);
    const tab = new FirefoxBase();
    tab._initContext(this._firefox, contextId);
    return tab;
  }

  async getTab(
    idOrNum?: string | number,
    title?: string,
    url?: string
  ): Promise<FirefoxBase> {
    const contextId = await this._firefox.getTab(idOrNum, title, url);
    const tab = new FirefoxBase();
    tab._initContext(this._firefox, contextId);
    return tab;
  }

  async close(): Promise<void> {
    await this._firefox.closeTab(this._contextId);
    FirefoxPage._PAGES.delete(this._firefox.address);
  }

  async quit(timeout = 5000, force = false): Promise<void> {
    FirefoxPage._PAGES.delete(this._firefox.address);
    await this._firefox.quit(timeout, force);
  }
}
