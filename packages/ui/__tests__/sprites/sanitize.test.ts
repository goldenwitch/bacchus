import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../../src/lib/sprites/sanitize.js';

describe('sanitizeSvg', () => {
  it('preserves valid SVG content', () => {
    const svg = '<svg><symbol id="s"><circle r="42" cx="50" cy="50"/></symbol></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('preserves animate and filter elements', () => {
    const svg =
      '<symbol id="s"><circle r="42"/><animate attributeName="r" values="40;42;40" dur="2s"/></symbol>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('removes script elements', () => {
    const svg =
      '<svg><symbol id="s"><circle r="42"/></symbol><script>alert("xss")</script></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"><circle r="42"/></symbol></svg>');
  });

  it('removes script elements case-insensitively', () => {
    const svg = '<svg><SCRIPT>alert(1)</SCRIPT><symbol id="s"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"/></svg>');
  });

  it('removes foreignObject elements', () => {
    const svg =
      '<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><div>evil</div></body></foreignObject><symbol id="s"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"/></svg>');
  });

  it('removes iframe elements', () => {
    const svg = '<svg><iframe src="evil.html"></iframe><symbol id="s"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"/></svg>');
  });

  it('removes embed elements', () => {
    const svg = '<svg><embed src="evil.swf"/><symbol id="s"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"/></svg>');
  });

  it('removes object elements', () => {
    const svg = '<svg><object data="evil.swf"></object><symbol id="s"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"/></svg>');
  });

  it('strips on* event handler attributes', () => {
    const svg = '<svg><circle r="42" onclick="alert(1)" onerror="alert(2)"/></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><circle r="42"/></svg>');
  });

  it('strips onload from symbol', () => {
    const svg = '<svg><symbol id="s" onload="alert(1)"><circle r="42"/></symbol></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><symbol id="s"><circle r="42"/></symbol></svg>');
  });

  it('strips javascript: href', () => {
    const svg = '<svg><a href="javascript:alert(1)"><circle r="42"/></a></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><a><circle r="42"/></a></svg>');
  });

  it('strips javascript: xlink:href', () => {
    const svg = '<svg><a xlink:href="javascript:alert(1)"><circle r="42"/></a></svg>';
    expect(sanitizeSvg(svg)).toBe('<svg><a><circle r="42"/></a></svg>');
  });

  it('preserves normal href attributes', () => {
    const svg = '<svg><use href="#sprite-default"/></svg>';
    expect(sanitizeSvg(svg)).toBe(svg);
  });

  it('handles multiple dangerous elements at once', () => {
    const svg =
      '<svg><script>x</script><foreignObject>y</foreignObject><symbol id="s" onclick="z"><circle r="42"/></symbol></svg>';
    const result = sanitizeSvg(svg);
    expect(result).not.toContain('script');
    expect(result).not.toContain('foreignObject');
    expect(result).not.toContain('onclick');
    expect(result).toContain('<symbol id="s">');
    expect(result).toContain('<circle r="42"/>');
  });

  it('returns empty-ish SVG when everything is dangerous', () => {
    const svg = '<script>alert(1)</script>';
    expect(sanitizeSvg(svg)).toBe('');
  });
});
