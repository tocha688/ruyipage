type Driver = { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> };

export async function status(driver: Driver): Promise<Record<string, unknown>> {
  return driver.run('session.status');
}

export async function new_(
  driver: Driver,
  capabilities?: Record<string, unknown>,
  userPromptHandler?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const caps: Record<string, unknown> = { ...(capabilities || {}) };
  if (userPromptHandler) {
    const alwaysMatch = { ...(caps['alwaysMatch'] as Record<string, unknown> || {}) };
    alwaysMatch['unhandledPromptBehavior'] = { ...userPromptHandler };
    caps['alwaysMatch'] = alwaysMatch;
  }
  return driver.run('session.new', { capabilities: caps });
}

export async function end(driver: Driver): Promise<Record<string, unknown>> {
  return driver.run('session.end');
}

export async function subscribe(
  driver: Driver,
  events: string | string[],
  contexts?: string[]
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {
    events: Array.isArray(events) ? events : [events],
  };
  if (contexts) params['contexts'] = Array.isArray(contexts) ? contexts : [contexts];
  return driver.run('session.subscribe', params);
}

export async function unsubscribe(
  driver: Driver,
  events?: string | string[],
  contexts?: string[],
  subscription?: string | string[]
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (subscription) {
    params['subscriptions'] = typeof subscription === 'string' ? [subscription] : subscription;
  } else {
    if (events) params['events'] = Array.isArray(events) ? events : [events];
    if (contexts) params['contexts'] = Array.isArray(contexts) ? contexts : [contexts];
  }
  return driver.run('session.unsubscribe', params);
}
