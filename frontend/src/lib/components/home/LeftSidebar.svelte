<script lang="ts">
  import {
    Plus,
    Library,
    ChevronDown,
    ChevronUp,
    PanelLeftClose,
    Edit3,
    Trash2,
    Ellipsis,
  } from 'lucide-svelte';
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
    onRenameProject,
    onDeleteProject,
  } = $props<{
    leftSidebarOpen?: boolean;
    showProjectsList?: boolean;
    activeNavItem?: string;
    onToggleLeftSidebar: () => void;
    onNavClick: (_navItem: string) => void;
    onToggleProjectsList: () => void;
    onRefreshProjectFiles: (_project: Project) => Promise<void>;
    onRenameProject: (_project: Project) => void;
    onDeleteProject: (_project: Project) => void;
  }>();

  // The project whose actions menu is open. One at a time.
  let menuFor: string | null = $state(null);

  const toggleMenu = (projectId: string) => {
    menuFor = menuFor === projectId ? null : projectId;
  };

  const chooseFromMenu = (action: (_project: Project) => void, project: Project) => {
    menuFor = null;
    action(project);
  };

  // pointerdown, not focusout: Safari does not focus a clicked button, so a
  // click elsewhere would never move focus out of the menu there.
  const onWindowPointerDown = (event: PointerEvent) => {
    if (!menuFor) return;
    const menu = (event.target as Element | null)?.closest('[data-project-menu]');
    if (menu?.getAttribute('data-project-menu') !== menuFor) menuFor = null;
  };

  const onWindowKeyDown = (event: KeyboardEvent) => {
    if (!menuFor || event.key !== 'Escape') return;
    document.querySelector<HTMLButtonElement>(`[data-project-menu="${menuFor}"] > button`)?.focus();
    menuFor = null;
  };
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeyDown} />

<!-- Below md it is an overlay that slides in; from md up it takes its place in the row. -->
<aside
  class="fixed inset-y-0 left-0 z-30 w-64 overflow-hidden md:static md:z-auto md:translate-x-0 motion-safe:transition-[width,translate] motion-safe:duration-200 motion-safe:ease-out {leftSidebarOpen
    ? 'translate-x-0 md:w-64'
    : '-translate-x-full md:w-0'}"
  inert={!leftSidebarOpen}
  aria-label="Projects"
>
  <div class="flex h-full w-64 flex-col border-r border-base-content/10 bg-base-200">
    <div class="flex h-12 shrink-0 items-center gap-2 px-3">
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        aria-label="Close sidebar"
        title="Close sidebar"
        onclick={onToggleLeftSidebar}
      >
        <PanelLeftClose class="w-5 h-5 text-base-content/70" />
      </button>
      <span class="text-sm font-medium">InsightSphere</span>
    </div>

    <div class="flex-1 overflow-y-auto px-3 pb-3">
      <div class="space-y-1">
        <button
          class="btn btn-ghost btn-sm h-9 w-full justify-start gap-3 font-normal {activeNavItem ===
          'new-project'
            ? 'btn-active'
            : ''}"
          onclick={() => onNavClick('new-project')}
        >
          <Plus class="w-4 h-4" />
          New Project
        </button>

        <button
          class="btn btn-ghost btn-sm h-9 w-full justify-start gap-3 font-normal {activeNavItem ===
          'file-library'
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
          <button
            class="btn btn-ghost btn-sm h-9 w-full justify-start gap-2 font-normal"
            onclick={onToggleProjectsList}
            aria-expanded={showProjectsList}
          >
            <h3 class="text-xs text-base-content/50">Projects</h3>
            {#if showProjectsList}
              <ChevronUp class="w-4 h-4 text-base-content/50" />
            {:else}
              <ChevronDown class="w-4 h-4 text-base-content/50" />
            {/if}
          </button>
          <div class="space-y-1 {showProjectsList ? 'block' : 'hidden'}">
            {#each $projects as project}
              <div
                class="group flex h-9 items-center gap-1 rounded-field border-l-2 pl-2.5 pr-3 transition-colors {$selectedProject?.id ===
                project.id
                  ? 'bg-primary/15 border-primary'
                  : 'border-transparent hover:bg-base-content/5'}"
              >
                <button
                  class="flex-1 text-left truncate text-sm hover:cursor-pointer {$selectedProject?.id ===
                  project.id
                    ? 'text-base-content'
                    : 'text-base-content/70'}"
                  onclick={async () => {
                    if ($selectedProject?.id !== project.id) {
                      await onRefreshProjectFiles(project);
                    }
                  }}
                >
                  {project.name}
                </button>
                <!-- Always visible on touch and narrow screens; with a mouse from md
                     up it stays quiet until the row is hovered or focused. -->
                <div
                  class="relative transition-opacity {menuFor === project.id
                    ? ''
                    : 'md:pointer-fine:opacity-0 md:pointer-fine:group-hover:opacity-100 md:pointer-fine:group-focus-within:opacity-100'}"
                  data-project-menu={project.id}
                >
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs btn-square"
                    aria-label="Project actions"
                    aria-expanded={menuFor === project.id}
                    aria-controls="project-menu-{project.id}"
                    onclick={() => toggleMenu(project.id)}
                  >
                    <Ellipsis class="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {#if menuFor === project.id}
                    <ul
                      id="project-menu-{project.id}"
                      class="menu menu-sm absolute right-0 top-full z-10 mt-1 w-36 rounded-box border border-base-content/10 bg-base-100 p-1"
                    >
                      <li>
                        <button
                          type="button"
                          class="gap-2"
                          onclick={() => chooseFromMenu(onRenameProject, project)}
                        >
                          <Edit3 class="w-3.5 h-3.5" aria-hidden="true" />
                          Rename
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          class="gap-2 text-error"
                          onclick={() => chooseFromMenu(onDeleteProject, project)}
                        >
                          <Trash2 class="w-3.5 h-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </li>
                    </ul>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="mt-6 px-3">
          <p class="text-sm text-base-content/70">No projects yet</p>
          <p class="mt-1 text-xs text-base-content/60">
            A project holds the documents you ask questions about.
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-sm -ml-3 mt-2 gap-2 font-normal"
            onclick={() => onNavClick('new-project')}
          >
            <Plus class="w-4 h-4" aria-hidden="true" />
            New project
          </button>
        </div>
      {/if}
    </div>

    <div class="border-t border-base-content/10 p-3">
      <UserHeader />
    </div>
  </div>
</aside>
