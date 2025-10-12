<script lang="ts">
  import { marked } from 'marked';

  let { content, messageId } = $props<{
    content: string;
    messageId: string;
  }>();

  // Function to render markdown content with clickable citations
  const renderMarkdown = (content: string, messageId: string): string => {
    try {
      const result = marked(content, {
        breaks: true, // Convert line breaks to <br>
        gfm: true, // GitHub Flavored Markdown
      });

      // Handle both string and Promise<string> return types
      let htmlContent = typeof result === 'string' ? result : content;

      // Replace [doc_id: X] or [doc_id: X, Y] with clickable links
      htmlContent = htmlContent.replace(/\[doc_id:\s*(\d+(?:,\s*\d+)*)\]/g, (match, ids) => {
        const idList = ids.split(',').map((id: string) => id.trim());
        return idList
          .map((id: string) => {
            const citationIndex = parseInt(id) - 1; // Convert to 0-based index
            return `<button 
              class="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-primary text-primary-content rounded-full mx-0.5 hover:bg-primary-focus transition-colors cursor-pointer" 
              onclick="window.handleCitationClick('${messageId}', ${citationIndex})"
              title="View source ${parseInt(id)}"
            >${id}</button>`;
          })
          .join('');
      });

      return htmlContent;
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return content; // Fallback to plain text
    }
  };
</script>

<div class="chat-markdown">
  {@html renderMarkdown(content, messageId)}
</div>

<style>
  .chat-markdown {
    color: inherit;
    line-height: 1.6;
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
