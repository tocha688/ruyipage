import { BrowserBiDiDriver } from '../core/driver';

export async function navigate(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  url: string,
  wait = 'complete'
): Promise<Record<string, unknown>> {
  return driver.run('browsingContext.navigate', { context, url, wait });
}

export async function getTree(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  maxDepth?: number,
  root?: string
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = {};
  if (maxDepth !== undefined) params['maxDepth'] = maxDepth;
  if (root) params['root'] = root;
  return driver.run('browsingContext.getTree', params);
}

export async function create(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  type_ = 'tab',
  referenceContext?: string,
  background = false,
  userContext?: string
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { type: type_ };
  if (referenceContext) params['referenceContext'] = referenceContext;
  if (background) params['background'] = true;
  if (userContext) params['userContext'] = userContext;
  return driver.run('browsingContext.create', params);
}

export async function close(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  promptUnload = false
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context };
  if (promptUnload) params['promptUnload'] = true;
  return driver.run('browsingContext.close', params);
}

export async function activate(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string
): Promise<Record<string, unknown>> {
  return driver.run('browsingContext.activate', { context });
}

export async function captureScreenshot(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  origin = 'viewport',
  format_?: Record<string, unknown>,
  clip?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context, origin };
  if (format_) params['format'] = format_;
  if (clip) params['clip'] = clip;
  return driver.run('browsingContext.captureScreenshot', params);
}

export async function print_(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  background?: boolean,
  margin?: Record<string, number>,
  orientation?: string,
  page?: Record<string, number>,
  pageRanges?: string[],
  scale?: number,
  shrinkToFit?: boolean
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context };
  if (background !== undefined) params['background'] = background;
  if (margin) params['margin'] = margin;
  if (orientation) params['orientation'] = orientation;
  if (page) params['page'] = page;
  if (pageRanges) params['pageRanges'] = pageRanges;
  if (scale !== undefined) params['scale'] = scale;
  if (shrinkToFit !== undefined) params['shrinkToFit'] = shrinkToFit;
  return driver.run('browsingContext.print', params);
}

export async function reload(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  ignoreCache = false,
  wait = 'complete'
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context, wait };
  if (ignoreCache) params['ignoreCache'] = true;
  return driver.run('browsingContext.reload', params);
}

export async function traverseHistory(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  delta: number
): Promise<Record<string, unknown>> {
  return driver.run('browsingContext.traverseHistory', { context, delta });
}

export async function handleUserPrompt(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  accept = true,
  userText?: string
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context, accept };
  if (userText !== undefined) params['userText'] = userText;
  return driver.run('browsingContext.handleUserPrompt', params);
}

export async function locateNodes(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  locator: Record<string, unknown>,
  maxNodeCount?: number,
  serializationOptions?: Record<string, unknown>,
  startNodes?: unknown[]
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context, locator };
  if (maxNodeCount !== undefined) params['maxNodeCount'] = maxNodeCount;
  if (serializationOptions) params['serializationOptions'] = serializationOptions;
  if (startNodes) params['startNodes'] = startNodes;
  return driver.run('browsingContext.locateNodes', params);
}

export async function setViewport(
  driver: BrowserBiDiDriver | { run: (m: string, p?: Record<string, unknown>) => Promise<Record<string, unknown>> },
  context: string,
  width?: number,
  height?: number,
  devicePixelRatio?: number
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { context };
  if (width !== undefined && height !== undefined) {
    params['viewport'] = { width, height };
  }
  if (devicePixelRatio !== undefined) params['devicePixelRatio'] = devicePixelRatio;
  return driver.run('browsingContext.setViewport', params);
}
