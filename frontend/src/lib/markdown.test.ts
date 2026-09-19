import { describe, expect, it } from 'vitest';
import { renderCitationChips, renderMarkdown } from './markdown';

describe('sanitising model output', () => {
  // A document can ask the model to reproduce markup. The summary path is the
  // realistic one: it sends the raw PDF to OpenAI and asks for markdown back,
  // so nothing is lost to OCR on the way.
  const attacks = [
    ['event handler on an image', '<img src=x onerror="alert(1)">'],
    ['inline script', '<script>alert(1)</script>'],
    ['javascript: in a markdown link', '[click](javascript:alert(1))'],
    ['javascript: in an anchor', '<a href="javascript:alert(1)">x</a>'],
    ['embedded frame', '<iframe src="https://evil.test"></iframe>'],
    ['svg onload', '<svg/onload=alert(1)>'],
    ['body onload', '<body onload=alert(1)>'],
    ['object tag', '<object data="evil.swf"></object>'],
    ['form post to elsewhere', '<form action="https://evil.test"><input name=x></form>'],
  ] as const;

  it.each(attacks)('neutralises %s', (_name, payload) => {
    const html = renderMarkdown(payload);
    // Anything surviving must be inert text, not a live attribute or element.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/\son\w+\s*=/i);
    expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i);
  });

  it('keeps ordinary markdown intact', () => {
    const html = renderMarkdown('**bold** and `code`\n\n- one\n- two');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
  });

  it('does not throw on empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});

describe('citation chips', () => {
  it('converts a single reference to a zero-based index', () => {
    const html = renderCitationChips('see [doc_id: 1]');
    expect(html).toContain('data-citation-index="0"');
    expect(html).toContain('>1</button>');
  });

  it('expands a list into one chip each', () => {
    const html = renderCitationChips('see [doc_id: 1, 3, 7]');
    expect(html).toContain('data-citation-index="0"');
    expect(html).toContain('data-citation-index="2"');
    expect(html).toContain('data-citation-index="6"');
  });

  it('survives sanitising, which would otherwise strip the data attribute', () => {
    const html = renderMarkdown('answer [doc_id: 2]', { citations: true });
    expect(html).toContain('data-citation-index="1"');
  });

  it('emits no inline handler, which would require unsafe-inline in the CSP', () => {
    const html = renderMarkdown('answer [doc_id: 1]', { citations: true });
    expect(html).not.toMatch(/onclick/i);
  });

  it('leaves unrelated bracketed text alone', () => {
    expect(renderCitationChips('an array [1, 2, 3]')).toBe('an array [1, 2, 3]');
    expect(renderCitationChips('[doc_id: abc]')).toBe('[doc_id: abc]');
  });

  it('ignores a zero index rather than producing -1', () => {
    expect(renderCitationChips('[doc_id: 0]')).not.toContain('data-citation-index="-1"');
  });
});
