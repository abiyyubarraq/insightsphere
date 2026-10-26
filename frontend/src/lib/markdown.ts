import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Rendering for assistant answers and document summaries.
 *
 * Both are model output derived from document text, so both are untrusted: a
 * document can instruct the model to reproduce markup, and marked passes inline
 * HTML through by design. Everything is sanitised before it reaches {@html}.
 *
 * Shared by ChatMarkdown and SummaryMarkdown so the two cannot drift apart —
 * only one of them had a sanitiser to begin with.
 */
// Not `as const`: DOMPurify's Config wants a mutable string[] for ADD_ATTR.
const PURIFY_OPTIONS: Parameters<typeof DOMPurify.sanitize>[1] = {
  ADD_ATTR: ['data-citation-index'],
  USE_PROFILES: { html: true },
};

const MARKER = /([ \t]*)\[doc_id:\s*(\d+(?:,\s*\d+)*)\]/g;
// A run of markers with the spaces around them, so adjacent markers removed
// together leave one gap, not two.
const MARKER_RUN = /([ \t]*)((?:\[doc_id:\s*\d+(?:,\s*\d+)*\][ \t]*)+)/g;

const chip = (n: number) =>
  `<button type="button" class="citation-chip" data-citation-index="${n - 1}" title="View source ${n}">${n}</button>`;

/**
 * Rewrites [doc_id: 1, 2] into buttons the citation handler can pick up, only
 * for ids 1..citationCount. Saved answers can still cite a source that does
 * not exist, and that chip would open nothing. Such ids are dropped, and a
 * marker left empty goes together with the space before it.
 */
export const renderCitationChips = (html: string, citationCount: number): string =>
  html.replace(MARKER_RUN, (match: string, lead: string, run: string, offset: number, all: string) => {
    const rewritten = run.replace(MARKER, (_marker: string, space: string, list: string) => {
      const ids = list
        .split(',')
        .map((id) => Number.parseInt(id.trim(), 10))
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= citationCount);
      return ids.length > 0 ? space + ids.map(chip).join('') : '';
    });
    if (rewritten.trim()) return lead + rewritten.trimStart();

    const before = all[offset - 1];
    const after = all.slice(offset + match.length);
    if (before === undefined || before === '\n' || before === '>') return lead;
    if (after === '' || /^(\r?\n|[.,;:!?)])/.test(after)) return '';
    return /[ \t]$/.test(run) || /^[\p{L}\p{N}]/u.test(after) ? ' ' : '';
  });

type RenderOptions = { citations?: false } | { citations: true; citationCount: number };

export const renderMarkdown = (raw: string, options: RenderOptions = {}): string => {
  try {
    const result = marked(raw, { breaks: true, gfm: true });
    let html = typeof result === 'string' ? result : raw;
    if (options.citations) html = renderCitationChips(html, options.citationCount);
    return DOMPurify.sanitize(html, PURIFY_OPTIONS);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Still sanitise the fallback: the input is what we did not trust.
    return DOMPurify.sanitize(raw, PURIFY_OPTIONS);
  }
};
