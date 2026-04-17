// RuyiPage error hierarchy

export class RuyiPageError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'RuyiPageError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ElementNotFoundError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'ElementNotFoundError';
  }
}

export class ElementLostError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'ElementLostError';
  }
}

export class ContextLostError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'ContextLostError';
  }
}

export class BiDiError extends RuyiPageError {
  error: string;
  bidiMessage: string;
  stacktrace: string;

  constructor(error: string, message = '', stacktrace = '') {
    super(`${error}: ${message}`);
    this.name = 'BiDiError';
    this.error = error;
    this.bidiMessage = message;
    this.stacktrace = stacktrace;
  }
}

export class PageDisconnectedError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'PageDisconnectedError';
  }
}

export class JavaScriptError extends RuyiPageError {
  exceptionDetails: Record<string, unknown> | null;

  constructor(message = '', exceptionDetails: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'JavaScriptError';
    this.exceptionDetails = exceptionDetails;
  }
}

export class BrowserConnectError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'BrowserConnectError';
  }
}

export class BrowserLaunchError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'BrowserLaunchError';
  }
}

export class AlertExistsError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'AlertExistsError';
  }
}

export class WaitTimeoutError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'WaitTimeoutError';
  }
}

export class NoRectError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'NoRectError';
  }
}

export class CanNotClickError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'CanNotClickError';
  }
}

export class LocatorError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'LocatorError';
  }
}

export class IncorrectURLError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'IncorrectURLError';
  }
}

export class NetworkInterceptError extends RuyiPageError {
  constructor(message?: string) {
    super(message);
    this.name = 'NetworkInterceptError';
  }
}
