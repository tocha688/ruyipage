/** Serialize a JS value to BiDi LocalValue */
export function serializeValue(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (value === undefined) return { type: 'undefined' };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { type: 'number', value: 'NaN' };
    if (!Number.isFinite(value)) return { type: 'number', value: value > 0 ? 'Infinity' : '-Infinity' };
    if (Object.is(value, -0)) return { type: 'number', value: '-0' };
    return { type: 'number', value };
  }
  if (typeof value === 'string') return { type: 'string', value };
  if (typeof value === 'bigint') return { type: 'bigint', value: value.toString() };
  if (Array.isArray(value)) return { type: 'array', value: value.map(serializeValue) };
  if (typeof value === 'object') {
    // SharedReference check
    const obj = value as Record<string, unknown>;
    if ('sharedId' in obj) {
      return { type: 'sharedReference', sharedId: obj['sharedId'] };
    }
    return {
      type: 'object',
      value: Object.entries(obj).map(([k, v]) => [k, serializeValue(v)]),
    };
  }
  return { type: 'string', value: String(value) };
}

/** Parse a BiDi RemoteValue to a JS value */
export function parseValue(remoteValue: unknown): unknown {
  if (!remoteValue || typeof remoteValue !== 'object') return remoteValue;
  const rv = remoteValue as Record<string, unknown>;
  const { type, value } = rv;

  switch (type) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'boolean': return Boolean(value);
    case 'number': {
      if (value === 'NaN') return NaN;
      if (value === 'Infinity') return Infinity;
      if (value === '-Infinity') return -Infinity;
      if (value === '-0') return -0;
      return Number(value);
    }
    case 'string': return String(value);
    case 'bigint': return BigInt(value as string);
    case 'array':
      return Array.isArray(value) ? (value as unknown[]).map(parseValue) : [];
    case 'object':
      if (Array.isArray(value)) {
        const obj: Record<string, unknown> = {};
        for (const pair of value as [unknown, unknown][]) {
          const k = typeof pair[0] === 'string' ? pair[0] : String(parseValue(pair[0]));
          obj[k] = parseValue(pair[1]);
        }
        return obj;
      }
      return {};
    case 'map': {
      const mapObj: Record<string, unknown> = {};
      if (Array.isArray(value)) {
        for (const pair of value as [unknown, unknown][]) {
          const k = String(parseValue(pair[0]));
          mapObj[k] = parseValue(pair[1]);
        }
      }
      return mapObj;
    }
    case 'set':
      return Array.isArray(value) ? new Set((value as unknown[]).map(parseValue)) : new Set();
    case 'node':
    case 'window':
    case 'error':
      return remoteValue;
    default:
      return value !== undefined ? value : null;
  }
}

export function makeSharedRef(sharedId: string, handle?: string): Record<string, unknown> {
  const ref: Record<string, unknown> = { type: 'sharedReference', sharedId };
  if (handle) ref['handle'] = handle;
  return ref;
}
