<script lang="ts">
  import { marked } from 'marked';

  let { content } = $props<{
    content: string;
  }>();

  // Function to render markdown content for summaries
  const renderMarkdown = (content: string): string => {
    try {
      const result = marked(content, {
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
      });

      // Handle both string and Promise<string> return types
      return typeof result === 'string' ? result : content;
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return content; // Fallback to plain text
    }
  };
</script>

<div class="summary-markdown">
  {@html renderMarkdown(content)}
</div>

<style>
  .summary-markdown {
    color: inherit;
    line-height: 1.6;
  }

  /* Headers */
  .summary-markdown :global(h1),
  .summary-markdown :global(h2),
  .summary-markdown :global(h3),
  .summary-markdown :global(h4),
  .summary-markdown :global(h5),
  .summary-markdown :global(h6) {
    color: inherit;
    margin: 0.75rem 0 0.5rem 0;
    font-weight: 600;
  }

  .summary-markdown :global(h1) {
    font-size: 1.25rem;
  }
  .summary-markdown :global(h2) {
    font-size: 1.125rem;
  }
  .summary-markdown :global(h3) {
    font-size: 1rem;
  }

  /* Paragraphs */
  .summary-markdown :global(p) {
    margin: 0.5rem 0;
  }

  /* Lists */
  .summary-markdown :global(ul),
  .summary-markdown :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .summary-markdown :global(li) {
    margin: 0.25rem 0;
  }

  /* Code */
  .summary-markdown :global(code) {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: 'Courier New', monospace;
  }

  .summary-markdown :global(pre) {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .summary-markdown :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  /* Blockquotes */
  .summary-markdown :global(blockquote) {
    border-left: 4px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;
  }

  /* Tables */
  .summary-markdown :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5rem 0;
  }

  .summary-markdown :global(th),
  .summary-markdown :global(td) {
    border: 1px solid rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
    text-align: left;
  }

  .summary-markdown :global(th) {
    background-color: rgba(0, 0, 0, 0.1);
    font-weight: bold;
  }

  /* Strong/Bold text */
  .summary-markdown :global(strong) {
    font-weight: 600;
  }

  /* Emphasis/Italic text */
  .summary-markdown :global(em) {
    font-style: italic;
  }
</style>
