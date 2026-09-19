<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'isomorphic-dompurify';

  let { content, messageId, oncitation } = $props<{
    content: string;
    messageId: string;
    oncitation?: (messageId: string, citationIndex: number) => void;
  }>();

  /**
   * Renders assistant markdown.
   *
   * The output is model-generated from document text, so it is untrusted: a
   * document can ask the model to reproduce markup, and marked passes inline
   * HTML through by design. Everything is sanitised before it reaches {@html}.
   *
   * Citations are plain buttons carrying data attributes, handled by one
   * listener on the wrapper. They used to carry an inline onclick calling a
   * function hung off window, which required script-src 'unsafe-inline' and so
   * made a CSP impossible.
   */
  const renderMarkdown = (raw: string): string => {
    try {
      const result = marked(raw, { breaks: true, gfm: true });
      let html = typeof result === 'string' ? result : raw;

      html = html.replace(/\[doc_id:\s*(\d+(?:,\s*\d+)*)\]/g, (_match, ids: string) =>
        ids
          .split(',')
          .map((id: string) => {
            const n = parseInt(id.trim(), 10);
            if (!Number.isFinite(n)) return '';
            return `<button type="button" class="citation-chip" data-citation-index="${n - 1}" title="View source ${n}">${n}</button>`;
          })
          .join('')
      );

      return DOMPurify.sanitize(html, {
        ADD_ATTR: ['data-citation-index'],
        USE_PROFILES: { html: true },
      });
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return DOMPurify.sanitize(raw);
    }
  };

  const onWrapperClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>('[data-citation-index]');
    if (!target) return;
    const index = Number(target.dataset.citationIndex);
    if (Number.isFinite(index)) oncitation?.(messageId, index);
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="chat-markdown" onclick={onWrapperClick}>
  {@html renderMarkdown(content)}
</div>

<style>
  .chat-markdown {
    color: inherit;
    line-height: 1.6;
  }

  .chat-markdown :global(.citation-chip) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    margin: 0 0.125rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    background-color: var(--color-primary, #8b5cf6);
    color: var(--color-primary-content, #fff);
  }

  /* Headers */
  .chat-markdown :global(h1),
  .chat-markdown :global(h2),
  .chat-markdown :global(h3),
  .chat-markdown :global(h4),
  .chat-markdown :global(h5),
  .chat-markdown :global(h6) {
    color: inherit;
    margin: 0.5rem 0;
    font-weight: 600;
  }

  .chat-markdown :global(h1) {
    font-size: 1.25rem;
  }
  .chat-markdown :global(h2) {
    font-size: 1.125rem;
  }
  .chat-markdown :global(h3) {
    font-size: 1rem;
  }

  /* Paragraphs */
  .chat-markdown :global(p) {
    margin: 0.5rem 0;
  }

  /* Lists */
  .chat-markdown :global(ul),
  .chat-markdown :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .chat-markdown :global(li) {
    margin: 0.25rem 0;
  }

  /* Code */
  .chat-markdown :global(code) {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: 'Courier New', monospace;
  }

  .chat-markdown :global(pre) {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .chat-markdown :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  /* Blockquotes */
  .chat-markdown :global(blockquote) {
    border-left: 4px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;
  }

  /* Tables */
  .chat-markdown :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0;
  }

  .chat-markdown :global(th),
  .chat-markdown :global(td) {
    border: 1px solid rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
    text-align: left;
  }

  .chat-markdown :global(th) {
    background-color: rgba(0, 0, 0, 0.1);
    font-weight: bold;
  }
</style>
