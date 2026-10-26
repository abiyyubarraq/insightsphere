<figure class="space-y-6 rounded-box border border-base-content/10 bg-base-200 p-6">
  <figcaption class="text-sm text-base-content/70">Example</figcaption>

  <p class="ml-auto w-fit max-w-[85%] rounded-box bg-base-300 px-4 py-3 text-base">
    What does the audit say about vendor payments?
  </p>

  <p class="text-base leading-relaxed">
    Some payments were approved by the same person who asked for them
    <span class="chip">1</span>. The report suggests a second approver for large payments
    <span class="chip">1</span> and a monthly check of changes to vendor details
    <span class="chip">2</span>.
  </p>

  <ul class="space-y-2 border-t border-base-content/10 pt-4 text-sm text-base-content/70">
    <li class="flex items-center gap-3"><span class="chip">1</span> report.pdf · page 12</li>
    <li class="flex items-center gap-3"><span class="chip">2</span> report.pdf · page 14</li>
  </ul>
</figure>

<style>
  /* Same look as the citation chips in real chat answers (ChatMarkdown). */
  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
    vertical-align: 0.1em;
    background-color: var(--color-primary);
    color: var(--color-primary-content);
  }
</style>
