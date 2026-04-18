import { LocatorError } from '../errors';

export interface BiDiLocator {
  type: string;
  value: string | Record<string, unknown>;
  matchType?: string;
}

/** Parse a locator string or tuple to a BiDi locator dict */
export function parseLocator(locator: string | [string, string]): BiDiLocator {
  if (Array.isArray(locator)) {
    if (locator.length !== 2) {
      throw new LocatorError(`Tuple locator must be [type, value]: ${locator}`);
    }
    const [locType, locValue] = locator;
    const typeMap: Record<string, string> = {
      css: 'css',
      'css selector': 'css',
      xpath: 'xpath',
      text: 'innerText',
      inner_text: 'innerText',
      innertext: 'innerText',
      accessibility: 'accessibility',
    };
    const bidiType = typeMap[locType.toLowerCase().replace(/ /g, '')];
    if (!bidiType) {
      throw new LocatorError(`Unsupported locator type: ${locType}`);
    }
    if (bidiType === 'accessibility') {
      return { type: 'accessibility', value: { name: locValue } };
    }
    return { type: bidiType, value: locValue };
  }

  if (typeof locator !== 'string') {
    throw new LocatorError(`Locator must be a string or tuple: ${typeof locator}`);
  }

  const loc = locator.trim();
  if (!loc) throw new LocatorError('Locator cannot be empty');

  // CSS prefix
  if (loc.startsWith('css:') || loc.startsWith('c:')) {
    const prefix = loc.startsWith('css:') ? 'css:' : 'c:';
    return { type: 'css', value: loc.slice(prefix.length).trim() };
  }

  // XPath prefix
  if (loc.startsWith('xpath:') || loc.startsWith('x:')) {
    const prefix = loc.startsWith('xpath:') ? 'xpath:' : 'x:';
    return { type: 'xpath', value: loc.slice(prefix.length).trim() };
  }

  // XPath auto-detect
  if (loc.startsWith('/') || loc.startsWith('./') || loc.startsWith('(')) {
    return { type: 'xpath', value: loc };
  }

  // text exact match
  if (loc.startsWith('text=')) {
    return { type: 'innerText', value: loc.slice(5), matchType: 'full' };
  }

  // text contains match
  if (loc.startsWith('text:')) {
    return { type: 'innerText', value: loc.slice(5) };
  }

  // CSS ID
  if (loc.startsWith('#')) {
    return { type: 'css', value: loc };
  }

  // CSS class
  if (loc.startsWith('.') && !loc.startsWith('./')) {
    return { type: 'css', value: loc };
  }

  // tag locator
  if (loc.startsWith('tag:')) {
    return parseTagLocator(loc.slice(4));
  }

  // multi-attr
  if (loc.startsWith('@@')) {
    return parseMultiAttr(loc, '');
  }

  // single attr
  if (loc.startsWith('@')) {
    return parseSingleAttr(loc.slice(1), '');
  }

  // looks like CSS selector
  if (looksLikeCssSelector(loc)) {
    return { type: 'css', value: loc };
  }

  // default: innerText contains
  return { type: 'innerText', value: loc };
}

function parseTagLocator(tagAndRest: string): BiDiLocator {
  const doubleAt = tagAndRest.indexOf('@@');
  const singleAt = tagAndRest.indexOf('@');

  if (doubleAt >= 0 && (singleAt < 0 || doubleAt <= singleAt)) {
    const tag = tagAndRest.slice(0, doubleAt).trim();
    return parseMultiAttr(tagAndRest.slice(doubleAt), tag);
  } else if (singleAt >= 0) {
    const tag = tagAndRest.slice(0, singleAt).trim();
    return parseSingleAttr(tagAndRest.slice(singleAt + 1), tag);
  } else {
    return { type: 'css', value: tagAndRest.trim() };
  }
}

function parseSingleAttr(attrStr: string, tag: string): BiDiLocator {
  if (attrStr.includes('=')) {
    const eqIdx = attrStr.indexOf('=');
    const attr = attrStr.slice(0, eqIdx).trim();
    const val = attrStr.slice(eqIdx + 1).trim();

    if (attr === 'text()') {
      if (tag) {
        return {
          type: 'xpath',
          value: `//${tag || '*'}[contains(text(), "${val}")]`,
        };
      }
      return { type: 'innerText', value: val };
    }

    const css = `${tag}[${attr}='${cssEscapeValue(val)}']`;
    return { type: 'css', value: css };
  } else {
    return { type: 'css', value: `${tag}[${attrStr.trim()}]` };
  }
}

function parseMultiAttr(locatorStr: string, tag: string): BiDiLocator {
  const parts = locatorStr.split('@@').filter(p => p.length > 0);
  const cssAttrs: string[] = [];
  let hasText = false;
  let textVal = '';

  for (const part of parts) {
    if (part.includes('=')) {
      const eqIdx = part.indexOf('=');
      const attr = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (attr === 'text()') {
        hasText = true;
        textVal = val;
      } else {
        cssAttrs.push(`[${attr}='${cssEscapeValue(val)}']`);
      }
    } else {
      cssAttrs.push(`[${part.trim()}]`);
    }
  }

  if (hasText) {
    const xpathParts: string[] = [];
    for (const part of parts) {
      if (part.includes('=')) {
        const eqIdx = part.indexOf('=');
        const attr = part.slice(0, eqIdx).trim();
        const val = part.slice(eqIdx + 1).trim();
        if (attr === 'text()') {
          xpathParts.push(`contains(text(), "${val}")`);
        } else {
          xpathParts.push(`@${attr}="${val}"`);
        }
      } else {
        xpathParts.push(`@${part.trim()}`);
      }
    }
    return {
      type: 'xpath',
      value: `//${tag || '*'}[${xpathParts.join(' and ')}]`,
    };
  }

  return { type: 'css', value: `${tag}${cssAttrs.join('')}` };
}

function cssEscapeValue(val: string): string {
  // Escape backslashes first, then quotes
  return val.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function looksLikeCssSelector(s: string): boolean {
  const patterns = [
    /^\[/,
    /^\w+\[/,
    /^\w+\s*>/,
    /^\w+\s*\+/,
    /^\w+\s*~/,
    /^\*/,
  ];
  return patterns.some(p => p.test(s));
}
