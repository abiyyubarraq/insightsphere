<script lang="ts">
  import { onMount } from 'svelte';

  let query = '';
  let loading = false;
  let result: any = null;
  let error = '';

  // Demo configuration
  const demoProjectId = '7fe82471-199f-4d7d-8785-5b81973ef588';
  const demoUserId = 'e4ad1e3d-20b6-4802-a4f2-43b49d0c594b';
  const legacyJwtSecret = 'your-legacy-jwt-secret'; // This should come from env

  // Sample queries for demo
  const sampleQueries = [
    'What are the main topics covered?',
    'Can you summarize the key findings?',
    'What methodology was used?',
    'What are the conclusions?',
    'machine learning',
    'neural networks',
  ];

  async function submitQuery() {
    if (!query.trim()) return;

    loading = true;
    error = '';
    result = null;

    try {
      console.log('Submitting demo query:', query);

      // Call the actual API endpoint
      const response = await fetch(`http://localhost:8000/v1/projects/${demoProjectId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${legacyJwtSecret}`,
          'X-Admin-User-Id': demoUserId,
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
      error =
        err instanceof Error
          ? err.message
          : 'Network error - make sure API is running on localhost:8000';
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
  <title>RAG Demo - InsightSphere</title>
</svelte:head>

<div class="min-h-screen bg-base-200">
  <div class="container mx-auto px-4 py-8 max-w-5xl">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-5xl font-bold text-primary mb-4">🤖 RAG Demo</h1>
      <p class="text-xl text-base-content/70 mb-2">
        Test the complete RAG pipeline: Query → AI Answer + Citations
      </p>
      <div class="alert alert-info max-w-2xl mx-auto">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <div>
          <strong>Demo Mode:</strong> This connects directly to the API at localhost:8000
          <br />Make sure you have documents processed in the demo project
        </div>
      </div>
    </div>

    <!-- Query Interface -->
    <div class="card bg-base-100 shadow-2xl mb-8">
      <div class="card-body">
        <h2 class="card-title text-3xl mb-6">💬 Ask Your Question</h2>

        <div class="form-control mb-6">
          <label class="label">
            <span class="label-text text-lg">What would you like to know about the documents?</span>
          </label>
          <textarea
            bind:value={query}
            on:keydown={handleKeydown}
            placeholder="Type your question here... (Press Enter to submit, Shift+Enter for new line)"
            class="textarea textarea-bordered textarea-lg h-32 text-lg resize-none"
            disabled={loading}
          ></textarea>
        </div>

        <div class="flex gap-3 flex-wrap mb-6">
          <button
            on:click={submitQuery}
            disabled={loading || !query.trim()}
            class="btn btn-primary btn-lg"
          >
            {#if loading}
              <span class="loading loading-spinner loading-md"></span>
              Processing Query...
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
            class="btn btn-outline btn-lg"
            disabled={loading}
          >
            🗑️ Clear
          </button>
        </div>

        <!-- Sample Questions -->
        <div class="divider text-lg">Try These Sample Questions</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {#each sampleQueries as sampleQuery}
            <button
              on:click={() => useSampleQuery(sampleQuery)}
              class="btn btn-ghost btn-sm justify-start h-auto py-3 px-4 text-left normal-case"
              disabled={loading}
            >
              <span class="text-primary mr-2">💡</span>
              {sampleQuery}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Error Display -->
    {#if error}
      <div class="alert alert-error mb-8 shadow-lg">
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
        <div>
          <h3 class="font-bold">Query Failed</h3>
          <div class="text-sm">{error}</div>
        </div>
      </div>
    {/if}

    <!-- Results Display -->
    {#if result}
      <div class="space-y-8">
        <!-- AI Answer -->
        <div
          class="card bg-gradient-to-br from-primary/20 via-secondary/10 to-accent/20 shadow-2xl border border-primary/20"
        >
          <div class="card-body">
            <div class="flex items-center justify-between mb-6">
              <h3 class="card-title text-3xl">🎯 AI Answer</h3>
              <div class="flex gap-2">
                <div class="badge badge-primary badge-lg">
                  {result.metadata.chunks_used} sources
                </div>
                <div class="badge badge-secondary badge-lg">
                  {result.metadata.processing_time_ms}ms
                </div>
              </div>
            </div>

            <div class="bg-base-100/50 backdrop-blur-sm p-6 rounded-xl border border-base-300">
              <div class="prose prose-lg max-w-none">
                <p class="text-xl leading-relaxed m-0">{result.answer}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Citations -->
        {#if result.citations && result.citations.length > 0}
          <div class="card bg-base-100 shadow-2xl">
            <div class="card-body">
              <h3 class="card-title text-2xl mb-6">
                📚 Sources & Citations
                <div class="badge badge-neutral">{result.citations.length} sources</div>
              </h3>

              <div class="grid gap-6">
                {#each result.citations as citation, index}
                  <div class="card bg-base-200 shadow-lg hover:shadow-xl transition-shadow">
                    <div class="card-body p-6">
                      <div class="flex justify-between items-start mb-4">
                        <h4 class="text-xl font-bold flex items-center gap-2">
                          <span class="badge badge-primary">{index + 1}</span>
                          📄 {citation.file_name}
                        </h4>
                        <div class="badge badge-success badge-lg">
                          {(citation.similarity_score * 100).toFixed(1)}% match
                        </div>
                      </div>

                      <div class="flex gap-4 text-sm text-base-content/70 mb-4">
                        {#if citation.page_number}
                          <div class="flex items-center gap-1">
                            <span>📍</span>
                            <span>Page {citation.page_number}</span>
                          </div>
                        {/if}
                        <div class="flex items-center gap-1">
                          <span>🧩</span>
                          <span>Chunk {citation.chunk_index}</span>
                        </div>
                      </div>

                      <div class="bg-base-100 p-4 rounded-lg border-l-4 border-primary shadow-sm">
                        <p class="leading-relaxed italic">"{citation.text_snippet}"</p>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {:else if result}
          <div class="alert alert-warning">
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
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 15c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <span
              >No citations found for this query. The AI generated an answer but couldn't find
              specific source references.</span
            >
          </div>
        {/if}

        <!-- Processing Details -->
        <div class="collapse collapse-arrow bg-base-100 shadow-xl">
          <input type="checkbox" />
          <div class="collapse-title text-xl font-medium">📊 Processing Details & Debug Info</div>
          <div class="collapse-content">
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">Processing Time</div>
                <div class="stat-value text-2xl">{result.metadata.processing_time_ms}ms</div>
              </div>
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">Chunks Retrieved</div>
                <div class="stat-value text-2xl">{result.metadata.chunks_retrieved}</div>
              </div>
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">Avg Similarity</div>
                <div class="stat-value text-2xl">
                  {(result.metadata.avg_similarity * 100).toFixed(1)}%
                </div>
              </div>
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">Context Length</div>
                <div class="stat-value text-2xl">{result.metadata.context_length}</div>
              </div>
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">Embedding Model</div>
                <div class="stat-value text-lg">{result.metadata.embedding_model}</div>
              </div>
              <div class="stat bg-base-200 rounded-lg">
                <div class="stat-title">LLM Model</div>
                <div class="stat-value text-lg">{result.metadata.llm_model}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Links -->
    <div class="text-center mt-12 space-x-4">
      <a
        href="http://localhost:8000/v1/test/dashboard"
        target="_blank"
        class="btn btn-outline btn-lg"
      >
        🧪 API Test Dashboard
      </a>
      <a href="/" class="btn btn-primary btn-lg"> 🏠 Home </a>
    </div>

    <!-- Footer Info -->
    <div class="text-center mt-8 text-base-content/50">
      <p>
        This demo connects to: <code>http://localhost:8000/v1/projects/{demoProjectId}/query</code>
      </p>
    </div>
  </div>
</div>

<style>
  .prose p {
    margin: 0;
  }
</style>
