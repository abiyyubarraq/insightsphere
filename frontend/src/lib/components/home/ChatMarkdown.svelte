<script lang="ts">
  import { renderMarkdown } from '$lib/markdown';

  let { content, messageId, oncitation } = $props<{
    content: string;
    messageId: string;
    oncitation?: (messageId: string, citationIndex: number) => void;
  }>();

  /**
   * Citations are plain buttons carrying a data attribute, handled by one
   * listener here. They used to be inline onclick attributes calling a function
   * hung off window, which required script-src 'unsafe-inline' and so ruled out
   * a CSP entirely.
   */
  const onWrapperClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement)?.closest<HTMLElement>('[data-citation-index]');
    if (!target) return;
    const index = Number(target.dataset.citationIndex);
    if (Number.isFinite(index)) oncitation?.(messageId, index);
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="chat-markdown" onclick={onWrapperClick}>
  {@html renderMarkdown(content, { citations: true })}
</div>

<style>
  /* Answers sit on a dark page, so tints are lighter, not darker. */
  .chat-markdown {
    color: inherit;
    line-height: 1.6;
    --md-tint: color-mix(in oklab, var(--color-base-content) 8%, transparent);
    --md-rule: color-mix(in oklab, var(--color-base-content) 20%, transparent);
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
    background-color: var(--color-primary);
    color: var(--color-primary-content);
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
  /* Tailwind's preflight removes list markers, so they are set again here. */
  .chat-markdown :global(ul),
  .chat-markdown :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    list-style-position: outside;
  }

  .chat-markdown :global(ul) {
    list-style-type: disc;
  }

  .chat-markdown :global(ol) {
    list-style-type: decimal;
  }

  .chat-markdown :global(li ul) {
    list-style-type: circle;
  }

  .chat-markdown :global(li li ul) {
    list-style-type: square;
  }

  .chat-markdown :global(li ol) {
    list-style-type: lower-alpha;
  }

  .chat-markdown :global(li > ul),
  .chat-markdown :global(li > ol) {
    margin: 0;
  }

  .chat-markdown :global(li::marker) {
    color: color-mix(in oklab, var(--color-base-content) 60%, transparent);
  }

  .chat-markdown :global(li) {
    margin: 0.25rem 0;
  }

  /* Code */
  .chat-markdown :global(code) {
    background-color: var(--md-tint);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: 'Courier New', monospace;
  }

  .chat-markdown :global(pre) {
    background-color: var(--md-tint);
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
    border-left: 4px solid var(--md-rule);
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
    border: 1px solid var(--md-rule);
    padding: 0.5rem;
    text-align: left;
  }

  .chat-markdown :global(th) {
    background-color: var(--md-tint);
    font-weight: bold;
  }
</style>
