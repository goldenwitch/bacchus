/**
 * Sanitize SVG text by removing potentially dangerous elements and attributes.
 *
 * Strips:
 * - Dangerous elements: <script>, <foreignObject>, <iframe>, <embed>, <object>
 * - Event handler attributes: on* (onclick, onerror, onload, etc.)
 * - javascript: URIs in href/xlink:href attributes
 */
export function sanitizeSvg(svgText: string): string {
  let result = svgText;

  // Remove dangerous elements and their contents (case-insensitive)
  const dangerousTags = [
    'script',
    'foreignObject',
    'iframe',
    'embed',
    'object',
  ];
  for (const tag of dangerousTags) {
    // Match both self-closing and paired tags
    result = result.replace(
      new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'),
      '',
    );
    result = result.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // Remove on* event handler attributes
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // Remove href/xlink:href with javascript: URIs
  result = result.replace(
    /\s+(?:xlink:)?href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    '',
  );

  return result;
}
