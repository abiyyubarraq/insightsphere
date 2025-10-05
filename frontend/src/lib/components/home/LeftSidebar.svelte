<script lang="ts">
  import { Plus, Search, Library, ChevronDown, ChevronUp, PanelRightOpen } from 'lucide-svelte';
  import { projects, selectedProject, type Project } from '../../../stores/project';
  import UserHeader from './UserHeader.svelte';

  let {
    leftSidebarOpen = $bindable(),
    showProjectsList = $bindable(),
    activeNavItem = $bindable(),
    onToggleLeftSidebar,
    onNavClick,
    onToggleProjectsList,
    onRefreshProjectFiles,
  } = $props<{
    leftSidebarOpen?: boolean;
    showProjectsList?: boolean;
    activeNavItem?: string;
    onToggleLeftSidebar: () => void;
    onNavClick: (_navItem: string) => void;
    onToggleProjectsList: () => void;
    onRefreshProjectFiles: (_project: Project) => Promise<void>;
  }>();
</script>

<!-- Left Sidebar - Absolute positioned -->
<div
  class="bg-base-100/50 absolute left-0 top-0 bottom-0 w-50 border-r border-base-300 border-r-white transition-transform duration-300 {leftSidebarOpen
    ? 'translate-x-0'
    : '-translate-x-full'} z-10"
>
  <div class="flex flex-col h-full">
    <!-- Navigation Menu -->
    <div class="flex-1 p-4">
      <div class="space-y-2">
        <div class="flex justify-end">
          <button
            class="btn btn-ghost btn-sm"
            title="Close Left Sidebar"
            onclick={onToggleLeftSidebar}
          >
            <PanelRightOpen class="w-4 h-4 text-base-content/70" />
          </button>
        </div>
        <button
          class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'new-project'
            ? 'btn-active'
            : ''}"
          onclick={() => onNavClick('new-project')}
        >
          <Plus class="w-4 h-4" />
          New Project
        </button>

        <button
          class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'search-project'
            ? 'btn-active'
            : ''}"
          onclick={() => onNavClick('search-project')}
        >
          <Search class="w-4 h-4" />
          Search Project
        </button>

        <button
          class="btn btn-ghost w-full justify-start gap-3 {activeNavItem === 'file-library'
            ? 'btn-active'
            : ''}"
          onclick={() => onNavClick('file-library')}
        >
          <Library class="w-4 h-4" />
          File Library
        </button>
      </div>

      <!-- Projects List - Chat History Style -->
      {#if $projects.length > 0}
        <div class="mt-6">
          <button class="btn btn-ghost w-full justify-start gap-3" onclick={onToggleProjectsList}>
            <h3 class="text-sm font-semibold text-base-content/70">Projects</h3>
            {#if showProjectsList}
              <ChevronUp class="w-3 h-3 text-base-content/70" />
            {:else}
              <ChevronDown class="w-3 h-3 text-base-content/70" />
            {/if}
          </button>
          <div class="space-y-1 {showProjectsList ? 'block' : 'hidden'}">
            {#each $projects as project}
              <button
                class="hover:cursor-pointer text-left truncate w-full px-3 py-2 rounded-md text-sm hover:bg-primary/20 transition-colors {$selectedProject?.id ===
                project.id
                  ? 'bg-primary/20 text-primary'
                  : 'text-base-content/80'}"
                onclick={async () => {
                  if ($selectedProject?.id !== project.id) {
                    await onRefreshProjectFiles(project);
                  }
                }}
              >
                {project.name}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="py-8">
          <p class="text-sm font-semibold text-base-content/70">No projects found</p>
        </div>
      {/if}
    </div>

    <!-- User Header at Bottom -->
    <div class="p-4 border-t border-base-300">
      <UserHeader />
    </div>
  </div>
</div>
