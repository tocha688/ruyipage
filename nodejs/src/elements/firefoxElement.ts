import { ContextDriver } from '../core/driver';
import { parseValue, makeSharedRef, serializeValue } from '../utils/bidiValues';
import * as bidiScript from '../bidi/script';
import { ElementLostError, ElementNotFoundError } from '../errors';
import { parseLocator } from '../utils/locator';
import * as bidiContext from '../bidi/browsingContext';

// Forward declaration
export interface FirefoxBaseInterface {
  _driver: ContextDriver;
  _contextId: string;
  ele(locator: string | [string, string], index?: number, timeout?: number): Promise<FirefoxElement | NullElement>;
  eles(locator: string | [string, string], timeout?: number): Promise<FirefoxElement[]>;
}

function isNodeLostError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('no such node') || lower.includes('stale');
}

export class FirefoxElement {
  _owner: FirefoxBaseInterface;
  _sharedId: string;
  _handle: string | undefined;
  _nodeInfo: Record<string, unknown>;
  _locatorInfo: unknown;

  constructor(
    owner: FirefoxBaseInterface,
    sharedId: string,
    handle?: string,
    nodeInfo?: Record<string, unknown>,
    locatorInfo?: unknown
  ) {
    this._owner = owner;
    this._sharedId = sharedId;
    this._handle = handle;
    this._nodeInfo = nodeInfo || {};
    this._locatorInfo = locatorInfo;
  }

  static fromNode(
    owner: FirefoxBaseInterface,
    nodeData: unknown,
    locatorInfo?: unknown
  ): FirefoxElement | null {
    if (!nodeData || typeof nodeData !== 'object') return null;
    const nd = nodeData as Record<string, unknown>;

    if (nd['type'] === 'node') {
      const sharedId = nd['sharedId'] as string;
      const handle = nd['handle'] as string | undefined;
      const value = (nd['value'] as Record<string, unknown>) || {};
      if (sharedId) return new FirefoxElement(owner, sharedId, handle, value, locatorInfo);
    }

    const sharedId = nd['sharedId'] as string;
    if (sharedId) {
      const handle = nd['handle'] as string | undefined;
      const value = (nd['value'] as Record<string, unknown>) || {};
      return new FirefoxElement(owner, sharedId, handle, value, locatorInfo);
    }

    return null;
  }

  private get _driver(): ContextDriver {
    return this._owner._driver;
  }

  private get _contextId(): string {
    return this._owner._contextId;
  }

  private _sharedRef(): Record<string, unknown> {
    return makeSharedRef(this._sharedId, this._handle);
  }

  private async _callJsOnSelfRaw(funcDecl: string, ...args: unknown[]): Promise<Record<string, unknown>> {
    const serializedArgs = args.map(a => {
      if (typeof a === 'object' && a !== null && ('sharedId' in a || 'type' in a)) {
        return a as Record<string, unknown>;
      }
      return serializeValue(a);
    });
    return bidiScript.callFunction(
      this._driver,
      this._contextId,
      funcDecl,
      [this._sharedRef(), ...serializedArgs]
    );
  }

  private async _runSafe(funcDecl: string, ...args: unknown[]): Promise<unknown> {
    try {
      const result = await this._callJsOnSelfRaw(funcDecl, ...args);
      const type = result['type'] as string;
      if (type === 'exception') return null;
      const rv = result['result'] as Record<string, unknown> | undefined;
      if (!rv) return null;
      return parseValue(rv);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isNodeLostError(msg)) {
        await this._refreshId();
        try {
          const result = await this._callJsOnSelfRaw(funcDecl, ...args);
          const rv = result['result'] as Record<string, unknown> | undefined;
          return rv ? parseValue(rv) : null;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private async _refreshId(): Promise<void> {
    if (!this._locatorInfo) throw new ElementLostError('Element reference is stale and no locator available to re-find');
    const locator = this._locatorInfo as string | [string, string];
    const parsed = parseLocator(locator);
    const result = await bidiContext.locateNodes(
      this._driver,
      this._contextId,
      parsed as unknown as Record<string, unknown>,
      1
    );
    const nodes = (result['nodes'] as unknown[]) || [];
    if (nodes.length === 0) throw new ElementNotFoundError('Could not re-find element');
    const el = FirefoxElement.fromNode(this._owner, nodes[0], locator);
    if (!el) throw new ElementNotFoundError('Could not re-find element');
    this._sharedId = el._sharedId;
    this._handle = el._handle;
  }

  async runJs(funcDecl: string, ...args: unknown[]): Promise<unknown> {
    const result = await this._callJsOnSelfRaw(funcDecl, ...args);
    const rv = result['result'] as Record<string, unknown> | undefined;
    return rv ? parseValue(rv) : null;
  }

  // ===== Async property getters =====

  get tag(): Promise<string> {
    const cached = this._nodeInfo['localName'] as string;
    if (cached) return Promise.resolve(cached.toLowerCase());
    return this._runSafe('(el) => el.tagName.toLowerCase()').then(v => (v as string) || '');
  }

  get text(): Promise<string> {
    return this._runSafe('(el) => el.textContent').then(v => (v as string) || '');
  }

  get innerHtml(): Promise<string> {
    return this._runSafe('(el) => el.innerHTML').then(v => (v as string) || '');
  }

  get html(): Promise<string> {
    return this._runSafe('(el) => el.outerHTML').then(v => (v as string) || '');
  }

  get value(): Promise<string | null> {
    return this._runSafe('(el) => el.value').then(v => v as string | null);
  }

  get attrs(): Promise<Record<string, string>> {
    return this._runSafe(`(el) => {
      const a = {};
      for (let i = 0; i < el.attributes.length; i++) {
        a[el.attributes[i].name] = el.attributes[i].value;
      }
      return a;
    }`).then(v => (v as Record<string, string>) || {});
  }

  get link(): Promise<string> {
    return this._runSafe('(el) => el.href || el.getAttribute("href") || ""').then(v => (v as string) || '');
  }

  get isDisplayed(): Promise<boolean> {
    return this._runSafe(`(el) => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }`).then(v => Boolean(v));
  }

  get isEnabled(): Promise<boolean> {
    return this._runSafe('(el) => !el.disabled').then(v => v !== false && v !== null);
  }

  get isChecked(): Promise<boolean> {
    return this._runSafe('(el) => el.checked').then(v => Boolean(v));
  }

  async attr(name: string): Promise<string | null> {
    return this._runSafe(`(el) => el.getAttribute(${JSON.stringify(name)})`).then(v => v as string | null);
  }

  async property(name: string): Promise<unknown> {
    return this._runSafe(`(el) => el[${JSON.stringify(name)}]`);
  }

  async style(name: string, pseudo?: string): Promise<string> {
    const pseudoArg = pseudo ? JSON.stringify(pseudo) : 'null';
    return this._runSafe(
      `(el) => window.getComputedStyle(el, ${pseudoArg}).getPropertyValue(${JSON.stringify(name)})`
    ).then(v => (v as string) || '');
  }

  async click(byJs = false, timeout?: number): Promise<this> {
    if (byJs) {
      await this._runSafe('(el) => el.click()');
    } else {
      // Use BiDi input action - click at element center
      const rect = await this.getRect();
      const x = Math.round(rect.x + rect.width / 2);
      const y = Math.round(rect.y + rect.height / 2);
      await this._driver.run('input.performActions', {
        actions: [
          {
            type: 'pointer',
            id: 'mouse',
            parameters: { pointerType: 'mouse' },
            actions: [
              { type: 'pointerMove', x, y, origin: 'viewport' },
              { type: 'pointerDown', button: 0 },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      });
    }
    return this;
  }

  async input(text: string, clear = false): Promise<this> {
    if (clear) await this.clear();
    await this._runSafe('(el) => el.focus()');
    // Type text using key actions
    const actions: Record<string, unknown>[] = [];
    for (const ch of text) {
      actions.push({ type: 'keyDown', value: ch });
      actions.push({ type: 'keyUp', value: ch });
    }
    await this._driver.run('input.performActions', {
      actions: [{ type: 'key', id: 'keyboard', actions }],
    });
    return this;
  }

  async clear(): Promise<this> {
    await this._runSafe(`(el) => {
      el.focus();
      el.select && el.select();
      el.value = '';
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
    }`);
    return this;
  }

  async submit(): Promise<this> {
    await this._runSafe('(el) => { const f = el.closest("form"); if (f) f.submit(); else el.submit && el.submit(); }');
    return this;
  }

  async focus(): Promise<this> {
    await this._runSafe('(el) => el.focus()');
    return this;
  }

  async blur(): Promise<this> {
    await this._runSafe('(el) => el.blur()');
    return this;
  }

  async screenshot(asBase64 = true): Promise<string> {
    const rect = await this.getRect();
    const result = await this._driver.run('browsingContext.captureScreenshot', {
      origin: 'viewport',
      clip: {
        type: 'viewport',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    });
    const data = result['data'] as string;
    if (asBase64) return data;
    return data;
  }

  async ele(
    locator: string | [string, string],
    index = 1,
    timeout?: number
  ): Promise<FirefoxElement | NullElement> {
    const parsed = parseLocator(locator);
    try {
      const result = await bidiContext.locateNodes(
        this._driver,
        this._contextId,
        parsed as unknown as Record<string, unknown>,
        index,
        undefined,
        [this._sharedRef()]
      );
      const nodes = (result['nodes'] as unknown[]) || [];
      const idx = index - 1;
      if (idx < 0 || idx >= nodes.length) return new NullElement();
      return FirefoxElement.fromNode(this._owner, nodes[idx], locator) || new NullElement();
    } catch {
      return new NullElement();
    }
  }

  async eles(
    locator: string | [string, string],
    _timeout?: number
  ): Promise<FirefoxElement[]> {
    const parsed = parseLocator(locator);
    try {
      const result = await bidiContext.locateNodes(
        this._driver,
        this._contextId,
        parsed as unknown as Record<string, unknown>,
        undefined,
        undefined,
        [this._sharedRef()]
      );
      const nodes = (result['nodes'] as unknown[]) || [];
      return nodes
        .map(n => FirefoxElement.fromNode(this._owner, n, locator))
        .filter((e): e is FirefoxElement => e !== null);
    } catch {
      return [];
    }
  }

  async scrollIntoView(): Promise<void> {
    await this._runSafe('(el) => el.scrollIntoView({ behavior: "smooth", block: "center" })');
  }

  async getRect(): Promise<{ x: number; y: number; width: number; height: number }> {
    const result = await this._runSafe(`(el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }`);
    if (result && typeof result === 'object') {
      const r = result as { x: number; y: number; width: number; height: number };
      return r;
    }
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

/** Null element - returned when element is not found */
export class NullElement {
  readonly isNull = true;

  async getText(): Promise<string> { return ''; }
  async click(): Promise<this> { return this; }
  async input(_text: string): Promise<this> { return this; }
  async clear(): Promise<this> { return this; }
  async submit(): Promise<this> { return this; }
  async focus(): Promise<this> { return this; }
  async blur(): Promise<this> { return this; }
  async attr(_name: string): Promise<null> { return null; }
  async property(_name: string): Promise<null> { return null; }
  async style(_name: string): Promise<string> { return ''; }
  async screenshot(): Promise<string> { return ''; }
  async ele(_locator: string | [string, string]): Promise<NullElement> { return new NullElement(); }
  async eles(_locator: string | [string, string]): Promise<FirefoxElement[]> { return []; }
  async scrollIntoView(): Promise<void> { /* no-op */ }
  async getRect(): Promise<{ x: number; y: number; width: number; height: number }> {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  async runJs(_funcDecl: string, ..._args: unknown[]): Promise<null> { return null; }

  get tag(): Promise<string> { return Promise.resolve(''); }
  get text(): Promise<string> { return Promise.resolve(''); }
  get innerHtml(): Promise<string> { return Promise.resolve(''); }
  get html(): Promise<string> { return Promise.resolve(''); }
  get value(): Promise<null> { return Promise.resolve(null); }
  get attrs(): Promise<Record<string, string>> { return Promise.resolve({}); }
  get link(): Promise<string> { return Promise.resolve(''); }
  get isDisplayed(): Promise<boolean> { return Promise.resolve(false); }
  get isEnabled(): Promise<boolean> { return Promise.resolve(false); }
  get isChecked(): Promise<boolean> { return Promise.resolve(false); }
}
