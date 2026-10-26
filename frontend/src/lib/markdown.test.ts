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

  // The chat styles lists by nesting (disc, then circle). If the nested list
  // ended up outside its parent item, the second level would look flat.
  it('keeps bulleted, numbered and nested lists as nested HTML', () => {
    const html = renderMarkdown('- a\n  - b\n\n1. x\n2. y');
    expect(html).toMatch(/<ul>\s*<li>a\s*<ul>\s*<li>b<\/li>\s*<\/ul>\s*<\/li>\s*<\/ul>/);
    expect(html).toMatch(/<ol>\s*<li>x<\/li>\s*<li>y<\/li>\s*<\/ol>/);
  });

  it('does not throw on empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});

describe('citation chips', () => {
  it('converts a single reference to a zero-based index', () => {
    const html = renderCitationChips('see [doc_id: 1]', 5);
    expect(html).toContain('data-citation-index="0"');
    expect(html).toContain('>1</button>');
  });

  it('expands a list into one chip each', () => {
    const html = renderCitationChips('see [doc_id: 1, 3, 7]', 7);
    expect(html).toContain('data-citation-index="0"');
    expect(html).toContain('data-citation-index="2"');
    expect(html).toContain('data-citation-index="6"');
  });

  it('survives sanitising, which would otherwise strip the data attribute', () => {
    const html = renderMarkdown('answer [doc_id: 2]', { citations: true, citationCount: 5 });
    expect(html).toContain('data-citation-index="1"');
  });

  it('emits no inline handler, which would require unsafe-inline in the CSP', () => {
    const html = renderMarkdown('answer [doc_id: 1]', { citations: true, citationCount: 5 });
    expect(html).not.toMatch(/onclick/i);
  });

  it('leaves unrelated bracketed text alone', () => {
    expect(renderCitationChips('an array [1, 2, 3]', 5)).toBe('an array [1, 2, 3]');
    expect(renderCitationChips('[doc_id: abc]', 5)).toBe('[doc_id: abc]');
  });

  it('ignores a zero index rather than producing -1', () => {
    expect(renderCitationChips('[doc_id: 0]', 5)).not.toContain('data-citation-index="-1"');
  });

  // An answer cited 9 and 18 with five sources shown. Old saved messages still
  // hold such ids, so the display has to guard against them too.
  it('makes chips only for ids within the source count', () => {
    const html = renderCitationChips('ok [doc_id: 5] and bad [doc_id: 6] [doc_id: 18]', 5);
    expect(html).toContain('data-citation-index="4"');
    expect(html).not.toContain('data-citation-index="5"');
    expect(html).not.toContain('data-citation-index="17"');
    expect(html).not.toContain('[doc_id');
    expect(html).toBe(
      'ok <button type="button" class="citation-chip" data-citation-index="4" title="View source 5">5</button> and bad'
    );
  });

  it('keeps only the valid ids of a mixed list', () => {
    const html = renderCitationChips('see [doc_id: 2, 9].', 5);
    expect(html.match(/citation-chip/g)).toHaveLength(1);
    expect(html).toContain('data-citation-index="1"');
    expect(html).not.toContain('9');
  });

  it('removes a marker with no valid id without leftover brackets or spaces', () => {
    expect(renderCitationChips('<p>As shown [doc_id: 7, 9]. Next [doc_id: 8] point.</p>', 5)).toBe(
      '<p>As shown. Next point.</p>'
    );
    expect(renderCitationChips('<p>[doc_id: 9] Starts here</p>', 5)).toBe('<p>Starts here</p>');
    expect(renderCitationChips('<p><strong>Key [doc_id: 9]</strong> point</p>', 5)).toBe(
      '<p><strong>Key</strong> point</p>'
    );
  });

  it('removes every marker when there are no sources', () => {
    const html = renderMarkdown('An answer [doc_id: 1] with [doc_id: 2, 3] ids.', {
      citations: true,
      citationCount: 0,
    });
    expect(html).not.toContain('citation-chip');
    expect(html).not.toContain('[doc_id');
    expect(html).toContain('An answer with ids.');
  });
});
