import { describe, expect, it } from 'vitest';
import { citationPageLabel } from './citationPage';

describe('the page shown under a source', () => {
  it('shows the real page of a PDF', () => {
    expect(citationPageLabel('paper.pdf', 12)).toBe(12);
  });

  it('reads the extension without caring about case', () => {
    expect(citationPageLabel('PAPER.PDF', 3)).toBe(3);
  });

  it('shows nothing for a PDF citation without a page', () => {
    expect(citationPageLabel('paper.pdf', null)).toBeNull();
    expect(citationPageLabel('paper.pdf', undefined)).toBeNull();
    expect(citationPageLabel('paper.pdf', 0)).toBeNull();
  });

  // The parser gives these formats page 1, so every source read "Page 1".
  it.each(['notes.md', 'notes.txt', 'report.docx'])('shows nothing for %s', (name) => {
    expect(citationPageLabel(name, 1)).toBeNull();
  });

  it('shows nothing for a name with no extension', () => {
    expect(citationPageLabel('README', 1)).toBeNull();
  });

  it('uses only the last extension of a name with dots', () => {
    expect(citationPageLabel('a.v2.md', 1)).toBeNull();
    expect(citationPageLabel('a.pdf.md', 1)).toBeNull();
    expect(citationPageLabel('a.v2.pdf', 4)).toBe(4);
  });
});
