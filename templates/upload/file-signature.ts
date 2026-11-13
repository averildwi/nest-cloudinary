export type DetectedMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf'
  | 'image/svg+xml';

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean => {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
};

/**
 * Detects the real file type from its magic bytes, ignoring the client-declared
 * MIME type. A `.jpg` that actually contains a script is reported as whatever
 * it really is (or null), never as an image.
 */
export function detectMimeFromContent(buffer: Buffer): DetectedMime | null {
  if (!buffer || buffer.length === 0) return null;

  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  // PDF: "%PDF-"
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'application/pdf';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  if (looksLikeSvg(buffer)) return 'image/svg+xml';

  return null;
}

/**
 * SVG is XML without fixed magic bytes, so detection is heuristic.
 *
 * The XML prolog can be long (declaration, comments, DOCTYPE with an ENTITY
 * block), so `<svg` is not always near the start. The search window is kept
 * wide on purpose: too narrow and a document with a long DOCTYPE would not be
 * recognised as SVG and would skip the SVG-specific checks — including one
 * that carries an XXE payload. `<svg/>` (self-closing, no space) must match too.
 */
function looksLikeSvg(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 4096).toString('utf8');
  const withoutBom = head.replace(/^\uFEFF/, '').trimStart();

  if (!withoutBom.startsWith('<')) return false;

  return /<svg[\s/>]/i.test(withoutBom);
}

const SVG_DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /<\s*script\b/i, reason: '<script> element' },
  { pattern: /<\s*foreignObject\b/i, reason: '<foreignObject> element' },
  { pattern: /<\s*iframe\b/i, reason: '<iframe> element' },
  { pattern: /<\s*embed\b/i, reason: '<embed> element' },
  { pattern: /<\s*object\b/i, reason: '<object> element' },
  {
    pattern: /<\s*use\b[^>]*\bhref\s*=\s*["']?\s*http/i,
    reason: 'external <use>',
  },
  { pattern: /\bon[a-z]+\s*=/i, reason: 'event attribute (on*)' },
  { pattern: /javascript\s*:/i, reason: 'javascript: URL' },
  { pattern: /data\s*:\s*text\/html/i, reason: 'text/html data URI' },
  { pattern: /<!ENTITY\b/i, reason: 'ENTITY declaration (XXE risk)' },
  {
    pattern: /<\s*set\b[^>]*\battributeName\s*=\s*["']?href/i,
    reason: 'animation that rewrites href',
  },
];

export interface SvgInspection {
  safe: boolean;
  reason?: string;
}

/** Rejects SVGs that could execute script when served or embedded. */
export function inspectSvg(buffer: Buffer): SvgInspection {
  const content = buffer.toString('utf8');

  for (const { pattern, reason } of SVG_DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      return { safe: false, reason };
    }
  }

  return { safe: true };
}
