<script lang="ts">
  import { FileText, Languages, Quote } from 'lucide-svelte';
  import { UserDashboard, LoadingState } from '../lib/components/home';
  import ProductPreview from '$lib/components/landing/ProductPreview.svelte';
  import Footer from '$lib/components/landing/Footer.svelte';
  import { isAuthenticated, loading, user } from '../stores/auth';
  import { projects as projectsStore } from '../stores/project';
  const { data } = $props();
  projectsStore.set(data.projects);

  const features = [
    {
      icon: FileText,
      title: 'PDF, DOCX, TXT and Markdown',
      body: 'Upload your files to a project. Scanned PDF pages are read with OCR.',
    },
    {
      icon: Languages,
      title: 'English or Indonesian',
      body: 'Ask your question in either language. The answer comes from the same documents.',
    },
    {
      icon: Quote,
      title: 'Answers with sources',
      body: 'Every answer cites its source. For PDFs it shows the page.',
    },
  ];
</script>

<svelte:head>
  <title>InsightSphere - Ask your documents</title>
  <meta
    name="description"
    content="Upload documents to a project and ask questions about them. Every answer cites its source."
  />
</svelte:head>

{#if $loading}
  <section class="container mx-auto p-8">
    <div class="text-center">
      <LoadingState />
    </div>
  </section>
{:else if $isAuthenticated && $user}
  <UserDashboard />
{:else}
  <div class="flex min-h-dvh flex-col bg-base-100 text-base-content">
    <header class="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6">
      <p class="text-lg font-semibold tracking-tight">InsightSphere</p>
    </header>

    <div class="flex-1">
      <section
        class="mx-auto grid max-w-5xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[7fr_5fr] lg:py-24"
      >
        <div class="space-y-6">
          <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Ask your documents. Get answers you can check.
          </h1>
          <p class="max-w-prose text-lg text-base-content/70">
            Upload files to a project and ask questions in plain words. Every answer shows which
            file it came from, and for a PDF, which page.
          </p>
          <div class="flex flex-wrap gap-4">
            <a href="/signup" class="btn btn-primary">Get started</a>
            <a href="/login" class="btn btn-outline border-base-content/20">Sign in</a>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section aria-labelledby="features-heading" class="border-t border-base-content/10">
        <div class="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 id="features-heading" class="text-2xl font-semibold tracking-tight">What it does</h2>
          <ul class="mt-8 grid gap-8 md:grid-cols-3">
            {#each features as feature (feature.title)}
              <li class="space-y-2">
                <feature.icon class="mb-4 size-5 text-base-content/70" aria-hidden="true" />
                <h3 class="text-base font-semibold">{feature.title}</h3>
                <p class="text-base text-base-content/70">{feature.body}</p>
              </li>
            {/each}
          </ul>
        </div>
      </section>
    </div>

    <Footer />
  </div>
{/if}
