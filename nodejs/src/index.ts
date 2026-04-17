export { FirefoxPage } from './page/firefoxPage';
export { FirefoxBase } from './page/firefoxBase';
export { FirefoxOptions } from './config/firefoxOptions';
export { FirefoxElement, NullElement } from './elements/firefoxElement';
export { Keys } from './utils/keys';
export { By } from './utils/by';
export { Settings } from './utils/settings';
export { parseLocator } from './utils/locator';
export { serializeValue, parseValue, makeSharedRef } from './utils/bidiValues';
export * from './errors';

// BiDi modules
export * as browsingContext from './bidi/browsingContext';
export * as script from './bidi/script';
export * as session from './bidi/session';
export * as input from './bidi/input';
export * as storage from './bidi/storage';

// Core
export { BrowserBiDiDriver, ContextDriver } from './core/driver';
export { Firefox } from './core/browser';

import { FirefoxPage } from './page/firefoxPage';
import { FirefoxOptions } from './config/firefoxOptions';

/** Launch a new Firefox browser and return a page */
export async function launch(options?: {
  headless?: boolean;
  private?: boolean;
  port?: number;
  browserPath?: string;
  userDir?: string;
  windowSize?: [number, number];
  timeoutBase?: number;
  timeoutPageLoad?: number;
  timeoutScript?: number;
}): Promise<FirefoxPage> {
  const opts = new FirefoxOptions();
  if (options) {
    opts.quickStart(options);
  }
  return FirefoxPage.create(opts);
}

/** Attach to an existing Firefox browser */
export async function attach(address = '127.0.0.1:9222'): Promise<FirefoxPage> {
  const opts = new FirefoxOptions().setAddress(address).setExistingOnly(true);
  return FirefoxPage.create(opts);
}
