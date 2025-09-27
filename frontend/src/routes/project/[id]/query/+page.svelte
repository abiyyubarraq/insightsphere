<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  const projectId = $page.params.id;

  let query = '';
  let loading = false;
  let result: any = null;
  let error = '';

  // Sample queries for quick testing
  const sampleQueries = [
    'What are the main topics covered in these documents?',
    'Can you summarize the key findings?',
    'What methodology was used?',
    'What are the conclusions and recommendations?',
    'Are there any important statistics or data points?',
  ];

  async function submitQuery() {
    if (!query.trim()) return;

    loading = true;
    error = '';
    result = null;

    try {
      console.log('Submitting query:', query);

      const response = await fetch(`/api/v1/projects/${projectId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // In a real app, you'd get this from auth store
          Authorization: 'Bearer demo-token',
          'X-Admin-User-Id': 'e4ad1e3d-20b6-4802-a4f2-43b49d0c594b',
        },
        body: JSON.stringify({
          query,
          options: {
            max_chunks: 5,
            similarity_threshold: 0.6,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        result = data;
        console.log('Query result:', result);
      } else {
        error = data.error || 'Query failed';
      }
    } catch (err) {
      console.error('Query error:', err);
      error = err instanceof Error ? err.message : 'Network error';
    } finally {
      loading = false;
    }
  }

  function useSampleQuery(sampleQuery: string) {
    query = sampleQuery;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitQuery();
    }
  }
</script>

<svelte:head>
  <title>Ask Questions - Project {projectId}</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <div class="container mx-auto px-4 py-8 max-w-4xl">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-primary mb-2">🤖 Ask Questions</h1>
      <p class="text-base-content/70">
        Query your documents with AI and get answers with source citations
      </p>
      <div class="text-sm text-base-content/50 mt-2">
        Project ID: <code class="bg-base-300 px-2 py-1 rounded">{projectId}</code>
      </div>
    </div>

    <!-- Query Input -->
    <div class="card bg-base-100 shadow-xl mb-6">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-4">💬 Ask Your Question</h2>

        <div class="form-control mb-4">
          <textarea
            bind:value={query}
            on:keydown={handleKeydown}
            placeholder="Type your question here... (Press Enter to submit, Shift+Enter for new line)"
            class="textarea textarea-bordered textarea-lg h-24 resize-none"
            disabled={loading}
          ></textarea>
        </div>

        <div class="flex gap-2 flex-wrap mb-4">
          <button
            on:click={submitQuery}
            disabled={loading || !query.trim()}
            class="btn btn-primary"
          >
            {#if loading}
              <span class="loading loading-spinner loading-sm"></span>
              Processing...
            {:else}
              🔍 Ask Question
            {/if}
          </button>

          <button
            on:click={() => {
              query = '';
              result = null;
              error = '';
            }}
            class="btn btn-outline"
            disabled={loading}
          >
            Clear
          </button>
        </div>

        <!-- Sample Questions -->
        <div class="divider">Sample Questions</div>
        <div class="flex flex-wrap gap-2">
          {#each sampleQueries as sampleQuery}
            <button
              on:click={() => useSampleQuery(sampleQuery)}
              class="btn btn-sm btn-ghost"
              disabled={loading}
            >
              {sampleQuery}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Error Display -->
    {#if error}
      <div class="alert alert-error mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span><strong>Error:</strong> {error}</span>
      </div>
    {/if}

    <!-- Results Display -->
    {#if result}
      <div class="space-y-6">
        <!-- AI Answer -->
        <div class="card bg-gradient-to-r from-primary/10 to-secondary/10 shadow-xl">
          <div class="card-body">
            <h3 class="card-title text-2xl mb-4">
              🎯 AI Answer
              <div class="badge badge-primary badge-lg">
                {result.metadata.chunks_used} sources
              </div>
            </h3>
            <div class="prose prose-lg max-w-none">
              <p class="text-lg leading-relaxed">{result.answer}</p>
            </div>
          </div>
        </div>

        <!-- Citations -->
        {#if result.citations && result.citations.length > 0}
          <div class="card bg-base-100 shadow-xl">
            <div class="card-body">
              <h3 class="card-title text-xl mb-4">
                📚 Sources & Citations ({result.citations.length})
              </h3>

              <div class="space-y-4">
                {#each result.citations as citation, index}
                  <div class="card bg-base-200 shadow-sm">
                    <div class="card-body p-4">
                      <div class="flex justify-between items-start mb-2">
                        <h4 class="font-semibold text-lg">
                          📄 Source {index + 1}: {citation.file_name}
                        </h4>
                        <div class="badge badge-success">
                          {(citation.similarity_score * 100).toFixed(1)}% match
                        </div>
                      </div>

                      <div class="text-sm text-base-content/70 mb-2">
                        {#if citation.page_number}
                          📍 Page {citation.page_number} •
                        {/if}
                        Chunk {citation.chunk_index}
                      </div>

                      <div class="bg-base-100 p-3 rounded border-l-4 border-primary">
                        <p class="text-sm leading-relaxed">"{citation.text_snippet}"</p>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- Metadata -->
        <div class="collapse collapse-arrow bg-base-100 shadow-xl">
          <input type="checkbox" />
          <div class="collapse-title text-lg font-medium">📊 Processing Details</div>
          <div class="collapse-content">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div class="font-semibold">Processing Time</div>
                <div>{result.metadata.processing_time_ms}ms</div>
              </div>
              <div>
                <div class="font-semibold">Chunks Retrieved</div>
                <div>{result.metadata.chunks_retrieved}</div>
              </div>
              <div>
                <div class="font-semibold">Avg Similarity</div>
                <div>{(result.metadata.avg_similarity * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div class="font-semibold">Context Length</div>
                <div>{result.metadata.context_length} chars</div>
              </div>
              <div>
                <div class="font-semibold">Embedding Model</div>
                <div>{result.metadata.embedding_model}</div>
              </div>
              <div>
                <div class="font-semibold">LLM Model</div>
                <div>{result.metadata.llm_model}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Back Link -->
    <div class="text-center mt-8">
      <a href="/" class="btn btn-outline"> ← Back to Dashboard </a>
    </div>
  </div>
</div>

<style>
  .prose p {
    margin-bottom: 1rem;
  }
</style>
