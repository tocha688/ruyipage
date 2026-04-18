import { serializeValue } from '../utils/bidiValues';

type Driver = { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> };

export async function evaluate(
  driver: Driver,
  context: string,
  expression: string,
  awaitPromise = true,
  resultOwnership = 'root',
  serializationOptions?: Record<string, unknown>,
  userActivation = false,
  sandbox?: string
): Promise<Record<string, unknown>> {
  const target: Record<string, unknown> = { context };
  if (sandbox) target['sandbox'] = sandbox;

  const params: Record<string, unknown> = {
    expression,
    target,
    awaitPromise,
    resultOwnership,
  };
  if (serializationOptions) params['serializationOptions'] = serializationOptions;
  if (userActivation) params['userActivation'] = true;

  return driver.run('script.evaluate', params);
}

export async function callFunction(
  driver: Driver,
  context: string,
  functionDeclaration: string,
  arguments_?: unknown[],
  this_?: unknown,
  awaitPromise = true,
  resultOwnership = 'root',
  serializationOptions?: Record<string, unknown>,
  userActivation = false,
  sandbox?: string
): Promise<Record<string, unknown>> {
  const target: Record<string, unknown> = { context };
  if (sandbox) target['sandbox'] = sandbox;

  const params: Record<string, unknown> = {
    functionDeclaration,
    target,
    awaitPromise,
    resultOwnership,
  };

  if (arguments_ !== undefined) {
    const serialized = arguments_.map(arg => {
      if (typeof arg === 'object' && arg !== null && ('sharedId' in arg || 'type' in arg)) {
        return arg;
      }
      return serializeValue(arg);
    });
    params['arguments'] = serialized;
  }

  if (this_ !== undefined) {
    if (typeof this_ === 'object' && this_ !== null && ('sharedId' in this_ || 'type' in this_)) {
      params['this'] = this_;
    } else {
      params['this'] = serializeValue(this_);
    }
  }

  if (serializationOptions) params['serializationOptions'] = serializationOptions;
  if (userActivation) params['userActivation'] = true;

  return driver.run('script.callFunction', params);
}

export async function addPreloadScript(
  driver: Driver,
  functionDeclaration: string,
  arguments_?: unknown[],
  contexts?: string[],
  sandbox?: string
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { functionDeclaration };
  if (arguments_) {
    params['arguments'] = arguments_.map(a =>
      typeof a === 'object' && a !== null ? a : serializeValue(a)
    );
  }
  if (contexts) params['contexts'] = Array.isArray(contexts) ? contexts : [contexts];
  if (sandbox) params['sandbox'] = sandbox;
  return driver.run('script.addPreloadScript', params);
}

export async function removePreloadScript(
  driver: Driver,
  scriptId: string
): Promise<Record<string, unknown>> {
  return driver.run('script.removePreloadScript', { script: scriptId });
}
