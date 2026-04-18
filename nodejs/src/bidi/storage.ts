type Driver = { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> };

function normalizePartition(partition?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!partition) return undefined;
  const p = { ...partition };
  if ('type' in p) return p;
  if ('context' in p) { p['type'] = 'context'; return p; }
  if ('userContext' in p || 'sourceOrigin' in p) { p['type'] = 'storageKey'; return p; }
  return p;
}

export async function getCookies(
  driver: Driver,
  filter_?: Record<string, unknown>,
  partition?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (filter_) params['filter'] = filter_;
  const p = normalizePartition(partition);
  if (p) params['partition'] = p;
  return driver.run('storage.getCookies', params);
}

export async function setCookie(
  driver: Driver,
  cookie: Record<string, unknown>,
  partition?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { cookie };
  const p = normalizePartition(partition);
  if (p) params['partition'] = p;
  return driver.run('storage.setCookie', params);
}

export async function deleteCookies(
  driver: Driver,
  filter_?: Record<string, unknown>,
  partition?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (filter_) params['filter'] = filter_;
  const p = normalizePartition(partition);
  if (p) params['partition'] = p;
  return driver.run('storage.deleteCookies', params);
}
