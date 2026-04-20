import * as fs from 'fs';
import { ContextDriver } from '../core/driver';
import { Firefox } from '../core/browser';
import { FirefoxElement, NullElement } from '../elements/firefoxElement';
import { parseLocator } from '../utils/locator';
import { parseValue } from '../utils/bidiValues';
import { Settings } from '../utils/settings';
import * as bidiContext from '../bidi/browsingContext';
import * as bidiScript from '../bidi/script';
import * as bidiStorage from '../bidi/storage';
import * as bidiSession from '../bidi/session';
import {
  JavaScriptError,
  WaitTimeoutError,
  ElementNotFoundError,
} from '../errors';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadModeToBiDiWait(mode: string): string {
  if (mode === 'eager') return 'interactive';
  if (mode === 'none') return 'none';
  return 'complete';
}

export class FirefoxBase {
  _browser!: Firefox;
  _contextId!: string;
  _driver!: ContextDriver;
  private _loadMode: string = 'complete';

  _initContext(browser: Firefox, contextId: string): void {
    this._browser = browser;
    this._contextId = contextId;
    this._driver = browser.getContextDriver(contextId);
    this._loadMode = loadModeToBiDiWait(browser.options.loadMode);
  }

  get tabId(): string {
    return this._contextId;
  }

  // ===== Navigation =====

  async get(url: string, wait?: string): Promise<void> {
    const waitStrategy = loadModeToBiDiWait(wait ?? this._loadMode);
    await bidiContext.navigate(this._driver, this._contextId, url, waitStrategy);
  }

  async back(): Promise<void> {
    await bidiContext.traverseHistory(this._driver, this._contextId, -1);
  }

  async forward(): Promise<void> {
    await bidiContext.traverseHistory(this._driver, this._contextId, 1);
  }

  async refresh(ignoreCache = false): Promise<void> {
    await bidiContext.reload(this._driver, this._contextId, ignoreCache);
  }

  // ===== Page info =====

  get title(): Promise<string> {
    return this._runScript('document.title').then(v => (v as string) || '');
  }

  get url(): Promise<string> {
    return this._runScript('location.href').then(v => (v as string) || '');
  }

  get html(): Promise<string> {
    return this._runScript('document.documentElement.outerHTML').then(v => (v as string) || '');
  }

  // ===== Element finding =====

  async ele(
    locator: string | [string, string],
    index = 1,
    timeout?: number
  ): Promise<FirefoxElement | NullElement> {
    const elements = await this._findElements(locator, index, timeout);
    const idx = index - 1;
    if (idx < 0 || idx >= elements.length) return new NullElement();
    return elements[idx];
  }

  async eles(
    locator: string | [string, string],
    timeout?: number
  ): Promise<FirefoxElement[]> {
    return this._findElements(locator, undefined, timeout);
  }

  async _findElements(
    locator: string | [string, string],
    maxCount?: number,
    timeout?: number
  ): Promise<FirefoxElement[]> {
    const parsed = parseLocator(locator);
    const timeoutMs = (timeout ?? Settings.implicitWait) * 1000;
    const deadline = Date.now() + (timeoutMs > 0 ? timeoutMs : 0);

    const doFind = async (): Promise<FirefoxElement[]> => {
      try {
        const result = await bidiContext.locateNodes(
          this._driver,
          this._contextId,
          parsed as unknown as Record<string, unknown>,
          maxCount
        );
        const nodes = (result['nodes'] as unknown[]) || [];
        return nodes
          .map(n => FirefoxElement.fromNode(this, n as unknown, locator))
          .filter((e): e is FirefoxElement => e !== null);
      } catch {
        return [];
      }
    };

    if (timeoutMs <= 0) return doFind();

    while (Date.now() <= deadline) {
      const elements = await doFind();
      if (elements.length > 0) return elements;
      if (Date.now() + 200 > deadline) break;
      await sleep(200);
    }

    return doFind();
  }

  // ===== JS execution =====

  async runJs(...scripts: string[]): Promise<unknown> {
    if (scripts.length === 1) {
      return this._runScript(scripts[0]);
    }
    // Multiple args: first is function declaration, rest are args
    const [funcDecl, ...args] = scripts;
    return this._callFunction(funcDecl, args);
  }

  async runJsAsync(script: string): Promise<unknown> {
    return this._runScript(script, true);
  }

  _parseResult(result: Record<string, unknown>): unknown {
    const type = result['type'] as string;
    if (type === 'exception') {
      const exDetails = result['exceptionDetails'] as Record<string, unknown> | undefined;
      const text = (exDetails?.['text'] as string) || 'JavaScript error';
      throw new JavaScriptError(text, exDetails || null);
    }
    const rv = result['result'] as Record<string, unknown> | undefined;
    if (!rv) return null;
    return parseValue(rv);
  }

  async _runScript(expression: string, awaitPromise = false): Promise<unknown> {
    const result = await bidiScript.evaluate(
      this._driver,
      this._contextId,
      expression,
      awaitPromise
    );
    return this._parseResult(result);
  }

  async _callFunction(funcDecl: string, args: unknown[] = []): Promise<unknown> {
    const result = await bidiScript.callFunction(
      this._driver,
      this._contextId,
      funcDecl,
      args
    );
    return this._parseResult(result);
  }

  // ===== Screenshots =====

  async screenshot(savePath?: string, asBase64 = false): Promise<string> {
    const result = await bidiContext.captureScreenshot(this._driver, this._contextId);
    const data = result['data'] as string;
    if (savePath) {
      fs.writeFileSync(savePath, Buffer.from(data, 'base64'));
    }
    return data;
  }

  async pdf(savePath?: string): Promise<string> {
    const result = await bidiContext.print_(this._driver, this._contextId);
    const data = result['data'] as string;
    if (savePath) {
      fs.writeFileSync(savePath, Buffer.from(data, 'base64'));
    }
    return data;
  }

  // ===== Cookies =====

  async getCookies(filter?: Record<string, unknown>): Promise<unknown[]> {
    const result = await bidiStorage.getCookies(this._driver, filter);
    return (result['cookies'] as unknown[]) || [];
  }

  async setCookie(
    name: string,
    value: string,
    domain?: string,
    path?: string,
    httpOnly?: boolean,
    secure?: boolean,
    sameSite?: string,
    expiry?: number
  ): Promise<void> {
    const cookie: Record<string, unknown> = {
      name,
      value: { type: 'string', value },
    };
    if (domain) cookie['domain'] = domain;
    if (path) cookie['path'] = path;
    if (httpOnly !== undefined) cookie['httpOnly'] = httpOnly;
    if (secure !== undefined) cookie['secure'] = secure;
    if (sameSite) cookie['sameSite'] = sameSite;
    if (expiry !== undefined) cookie['expiry'] = expiry;

    await bidiStorage.setCookie(this._driver, cookie);
  }

  async deleteCookies(filter?: Record<string, unknown>): Promise<void> {
    await bidiStorage.deleteCookies(this._driver, filter);
  }

  // ===== Dialog handling =====

  async handleDialog(accept = true, userText?: string): Promise<void> {
    await bidiContext.handleUserPrompt(this._driver, this._contextId, accept, userText);
    this._driver._browserDriver.alertFlag = false;
  }

  // ===== Wait =====

  async wait(seconds: number): Promise<void> {
    await sleep(seconds * 1000);
  }

  async waitForLoad(timeout?: number): Promise<void> {
    const timeoutMs = (timeout ?? Settings.pageLoadTimeout) * 1000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const state = await this._runScript('document.readyState');
        if (state === 'complete') return;
      } catch { /* retry */ }
      await sleep(200);
    }
    throw new WaitTimeoutError(`Page load timed out after ${timeout ?? Settings.pageLoadTimeout}s`);
  }

  async waitFor(
    condition: () => Promise<boolean>,
    timeout?: number,
    interval = 0.5
  ): Promise<boolean> {
    const timeoutMs = (timeout ?? Settings.baseTimeout) * 1000;
    const intervalMs = interval * 1000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await condition()) return true;
      } catch { /* retry */ }
      await sleep(intervalMs);
    }
    return false;
  }

  // ===== Scrolling =====

  async scrollTo(x: number, y: number): Promise<void> {
    await this._runScript(`window.scrollTo(${x}, ${y})`);
  }

  async scrollBy(x: number, y: number): Promise<void> {
    await this._runScript(`window.scrollBy(${x}, ${y})`);
  }

  // ===== Viewport =====

  async setViewport(width: number, height: number, devicePixelRatio?: number): Promise<void> {
    await bidiContext.setViewport(this._driver, this._contextId, width, height, devicePixelRatio);
  }

  // ===== Events =====

  async subscribe(events: string | string[]): Promise<string> {
    const result = await bidiSession.subscribe(
      this._driver._browserDriver,
      events,
      [this._contextId]
    );
    return (result['subscription'] as string) || '';
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    await bidiSession.unsubscribe(
      this._driver._browserDriver,
      undefined,
      undefined,
      subscriptionId
    );
  }
}
