type Driver = { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> };

export async function performActions(
  driver: Driver,
  context: string,
  actions: unknown[]
): Promise<Record<string, unknown>> {
  return driver.run('input.performActions', { context, actions });
}

export async function releaseActions(
  driver: Driver,
  context: string
): Promise<Record<string, unknown>> {
  return driver.run('input.releaseActions', { context });
}

export async function setFiles(
  driver: Driver,
  context: string,
  element: Record<string, unknown>,
  files: string[]
): Promise<Record<string, unknown>> {
  return driver.run('input.setFiles', { context, element, files });
}
