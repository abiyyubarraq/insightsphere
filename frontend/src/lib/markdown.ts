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

/** Rewrites [doc_id: 1, 2] into buttons the citation handler can pick up. */
export const renderCitationChips = (html: string): string =>
  html.replace(/\[doc_id:\s*(\d+(?:,\s*\d+)*)\]/g, (_match, ids: string) =>
    ids
      .split(',')
      .map((id) => {
        const n = Number.parseInt(id.trim(), 10);
        if (!Number.isFinite(n) || n < 1) return '';
        return `<button type="button" class="citation-chip" data-citation-index="${n - 1}" title="View source ${n}">${n}</button>`;
      })
      .join('')
  );

export const renderMarkdown = (raw: string, { citations = false } = {}): string => {
  try {
    const result = marked(raw, { breaks: true, gfm: true });
    let html = typeof result === 'string' ? result : raw;
    if (citations) html = renderCitationChips(html);
    return DOMPurify.sanitize(html, PURIFY_OPTIONS);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Still sanitise the fallback: the input is what we did not trust.
    return DOMPurify.sanitize(raw, PURIFY_OPTIONS);
  }
};
