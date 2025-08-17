<script lang="ts">
  import { UserDashboard, UserHeader, LoadingState, AuthButtons } from '../lib/components/home';
  import { isAuthenticated, loading, user } from '../stores/auth';
  import { projects as projectsStore, type Project } from '../stores/project';
  export let data: { projects: Project[] };
  projectsStore.set(data.projects);
</script>

<svelte:head>
  <title>InsightSphere - AI-Powered Document Analysis</title>
  <meta
    name="description"
    content="Transform your documents into actionable insights with AI-powered analysis"
  />
</svelte:head>

{#if $loading}
  <!-- Loading State -->
  <section class="container mx-auto p-8">
    <div class="text-center">
      <LoadingState />
    </div>
  </section>
{:else if $isAuthenticated && $user}
  <!-- Authenticated Layout -->
  <div
    class="relative min-h-screen bg-cover bg-center bg-no-repeat"
    style="background-image: url('/dashboard.png');"
  >
    <!-- User Header -->
    <header class="absolute top-0 right-0 p-6 z-10">
      <UserHeader />
    </header>

    <!-- Main Dashboard -->
    <div class="min-h-screen flex items-center justify-center p-8">
      <UserDashboard />
    </div>
  </div>
{:else}
  <!-- Non-authenticated Layout -->
  <div class="relative min-h-screen bg-black">
    <!-- Gradient Circle Background -->
    <!-- <div class="absolute inset-0 flex items-center justify-center">
      <div
        class="w-96 h-96 bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent rounded-full blur-3xl"
      ></div>
      <div
        class="absolute w-64 h-64 bg-gradient-to-tl from-primary/15 via-primary/10 to-transparent rounded-full blur-2xl -translate-x-20 translate-y-10"
      ></div>
    </div> -->

    <div class="relative z-10">
      <!-- Navigation Bar -->
      <!-- <div class="navbar bg-black/80 backdrop-blur-sm">
        <div class="navbar-start">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center">
              <span class="text-white font-bold">I</span>
            </div>
            <span class="text-xl font-bold text-white">InsightSphere</span>
          </div>
        </div>
        
        <div class="navbar-end">
          <AuthButtons />
        </div>
      </div> -->

      <!-- Hero Section -->
      <section class="flex items-center justify-center min-h-[80vh] p-8">
        <div class="text-center space-y-8 max-w-4xl">
          <div class="space-y-6">
            <h1 class="text-5xl font-bold text-white gradient-heading h-[12vh]">InsightSphere</h1>

            <!-- Home Image -->
            <div class="flex justify-center">
              <img
                src="/home.png"
                alt="InsightSphere Dashboard Preview"
                class="max-w-full h-[50vh] rounded-lg shadow-2xl"
              />
            </div>

            <p class="text-lg text-base-content/70">AI-powered document analysis and insights</p>
          </div>
          <div class="flex justify-center">
            <AuthButtons />
          </div>
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .gradient-heading {
    background: linear-gradient(45deg, #703bf7 0%, #6e29df 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
</style>
