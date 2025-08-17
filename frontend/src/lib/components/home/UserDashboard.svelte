<script lang="ts">
  import { Upload, Search, Plus, File, X } from 'lucide-svelte';
  import { projects, selectedProject } from '../../../stores/project';
  import { user } from '../../../stores/auth';
  import { get } from 'svelte/store';
  import {
    createProject,
    deleteDocument,
    getProjectFiles,
    uploadDocument,
  } from '../../../services/supabase';

  let newProjectName = '';
  let loading = false;
  let error = '';
  let uploadLoading = false;
  let uploadError = '';
  let fileInput: HTMLInputElement;
  let uploadedFiles: Array<{
    id: string;
    file_name: string;
    storage_path: string;
    created_at: string;
  }> = [];
  let removingFileLoading: Record<string, boolean> = {};

  const handleCreate = async () => {
    if (!newProjectName.trim()) return;
    loading = true;
    try {
      const p = await createProject(get(user)?.id as string, newProjectName.trim());
      projects.update((arr) => [...arr, p]);
      selectedProject.set(p);
      newProjectName = '';
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  };

  const handleUploadClick = () => {
    fileInput?.click();
  };

  const handleFileUpload = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file || !$selectedProject || !$user) return;

    uploadLoading = true;
    uploadError = '';

    try {
      const result = await uploadDocument(file, $selectedProject.id, $user.id);

      if ($selectedProject && $user) {
        try {
          const files = await getProjectFiles($selectedProject.id, $user.id);
          uploadedFiles = files;
        } catch (e: any) {
          error = e.message;
        }
      }

      target.value = '';
    } catch (e: any) {
      uploadError = e.message;
    } finally {
      uploadLoading = false;
    }
  };

  const removeFile = async (index: number) => {
    const file = uploadedFiles[index];
    if (!file || !$selectedProject || !$user) return;
    try {
      removingFileLoading[file.id] = true;
      await deleteDocument(file.id, $selectedProject.id, $user.id);
      uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
    } catch (e: any) {
      uploadError = e.message;
    } finally {
      removingFileLoading[file.id] = false;
    }
  };
</script>

{#if $projects.length === 0}
  <!-- No projects -->
  <div class="card w-1/2 backdrop-blur-lg shadow-xl border border-primary/20">
    <div class="card-body space-y-4">
      <h2 class="card-title">Create your first project</h2>
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}
      <input
        type="text"
        bind:value={newProjectName}
        placeholder="Project Name"
        class="input input-bordered w-full"
      />
      <button class="btn btn-primary gap-2" on:click={handleCreate} disabled={loading}>
        {#if loading}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <Plus class="w-4 h-4" />
        {/if}
        Create Project
      </button>
    </div>
  </div>
{:else if !$selectedProject}
  <!-- Select project -->
  <div class="card w-1/2 backdrop-blur-lg shadow-xl border border-primary/20">
    <div class="card-body space-y-4">
      <h2 class="card-title">Select a project</h2>
      <select
        class="select select-bordered w-full"
        bind:value={$selectedProject}
        on:change={async () => {
          if ($selectedProject && $user) {
            try {
              const files = await getProjectFiles($selectedProject.id, $user.id);
              uploadedFiles = files;
            } catch (e: any) {
              error = e.message;
            }
          }
        }}
      >
        <option value={null} disabled selected>Select project</option>
        {#each $projects as p}
          <option value={p}>{p.name}</option>
        {/each}
      </select>
      <!-- <button class="btn btn-primary gap-2" on:click={handleCreate} disabled={loading}>
        {#if loading}
          <span class="loading loading-spinner loading-xs"></span>
        {:else}
          <Plus class="w-4 h-4" />
        {/if}
        Create Project
      </button> -->
    </div>
  </div>
{:else}
  <!-- Existing dashboard -->
  <div class="w-full max-w-2xl mx-auto">
    <div class="card backdrop-blur-lg shadow-xl border border-primary/20">
      <div class="card-body">
        <h2 class="card-title text-2xl mb-2">
          Welcome back, {$user?.user_metadata?.full_name || $user?.email?.split('@')[0] || 'User'}!
          👋
        </h2>
        <p class="text-base-content/70 mb-6">
          Project: {$selectedProject?.name}
        </p>

        <!-- Upload Error -->
        {#if uploadError}
          <div class="alert alert-error mb-4">
            <X class="w-4 h-4" />
            {uploadError}
            <button class="btn btn-sm btn-ghost" on:click={() => (uploadError = '')}>
              <X class="w-4 h-4" />
            </button>
          </div>
        {/if}

        <!-- File Input (Hidden) -->
        <input
          type="file"
          bind:this={fileInput}
          on:change={handleFileUpload}
          accept=".pdf,.doc,.docx,.txt"
          class="hidden"
        />

        <div class="card-actions justify-center gap-4 flex-col sm:flex-row">
          <button
            class="btn btn-primary gap-2 flex-1 sm:flex-none"
            on:click={handleUploadClick}
            disabled={uploadLoading}
          >
            {#if uploadLoading}
              <span class="loading loading-spinner loading-xs"></span>
            {:else}
              <Upload class="w-4 h-4" />
            {/if}
            Upload Document
          </button>
          <button class="btn btn-outline btn-primary gap-2 flex-1 sm:flex-none">
            <Search class="w-4 h-4" />
            Chat With This Brain
          </button>
        </div>

        <!-- Uploaded Files List -->
        {#if uploadedFiles.length > 0}
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-3">Uploaded Documents</h3>
            <div class="space-y-2">
              {#each uploadedFiles as file, index}
                <div class="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                  <div class="flex items-center gap-3">
                    <File class="w-4 h-4 text-primary" />
                    <div>
                      <p class="font-medium">{file.file_name}</p>
                      <p class="text-sm text-base-content/70">
                        {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <button
                    class="btn btn-ghost btn-sm"
                    on:click={() => removeFile(index)}
                    disabled={removingFileLoading[file.id]}
                  >
                    {#if removingFileLoading[file.id]}
                      <span class="loading loading-spinner loading-xs"></span>
                    {:else}
                      <X class="w-4 h-4" />
                    {/if}
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
