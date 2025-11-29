# Svelte 5 Patterns & Best Practices

**Comprehensive guide to Svelte 5 runes, component patterns, and SvelteKit conventions for InsightSphere.**

---

## Table of Contents

1. [Svelte 5 Runes Deep Dive](#svelte-5-runes-deep-dive)
2. [Component Patterns](#component-patterns)
3. [State Management](#state-management)
4. [SvelteKit Routing](#sveltekit-routing)
5. [Server-Side Rendering](#server-side-rendering)
6. [Form Handling](#form-handling)
7. [API Integration](#api-integration)
8. [Performance Optimization](#performance-optimization)
9. [Common Pitfalls](#common-pitfalls)
10. [Testing Patterns](#testing-patterns)

---

## Svelte 5 Runes Deep Dive

### What are Runes?

**Runes** are Svelte 5's new reactive primitives that replace the reactivity model from Svelte 3/4.

**Key Runes**:
- `$state` - Reactive state
- `$derived` - Computed values
- `$effect` - Side effects
- `$props` - Component props
- `$bindable` - Two-way binding

### `$state` - Reactive State

#### Basic Usage

```typescript
<script lang="ts">
  // Primitive values
  let count = $state(0);
  let name = $state("");
  let isActive = $state(false);

  // Objects (entire object is reactive)
  let user = $state({
    id: 1,
    name: "Alice",
    email: "alice@example.com"
  });

  // Arrays
  let items = $state<string[]>([]);
  let documents = $state<Document[]>([]);

  // Mutations are automatically tracked
  function increment() {
    count++;  // ✅ Reactive
  }

  function addItem(item: string) {
    items.push(item);  // ✅ Reactive
  }

  function updateUser() {
    user.name = "Bob";  // ✅ Reactive
  }
</script>
```

#### Deep Reactivity

```typescript
let project = $state({
  id: "proj-123",
  name: "My Project",
  documents: [
    { id: "doc-1", name: "Report.pdf" },
    { id: "doc-2", name: "Summary.docx" }
  ]
});

// All mutations are reactive
project.name = "Updated Project";  // ✅ Reactive
project.documents.push({ id: "doc-3", name: "New.pdf" });  // ✅ Reactive
project.documents[0].name = "Updated Report.pdf";  // ✅ Reactive
```

#### Immutable Updates (Best Practice)

```typescript
// ❌ Mutation (works but less predictable)
function addDocument(doc: Document) {
  project.documents.push(doc);
}

// ✅ Immutable update (preferred)
function addDocument(doc: Document) {
  project = {
    ...project,
    documents: [...project.documents, doc]
  };
}
```

### `$derived` - Computed Values

#### Basic Derivation

```typescript
let firstName = $state("John");
let lastName = $state("Doe");

// Automatically recomputes when firstName or lastName changes
let fullName = $derived(`${firstName} ${lastName}`);

let count = $state(0);
let doubled = $derived(count * 2);
let isEven = $derived(count % 2 === 0);
```

#### Complex Derivations

```typescript
let documents = $state<Document[]>([]);
let searchQuery = $state("");
let statusFilter = $state<"all" | "ready" | "processing">("all");

// Complex filtering
let filteredDocuments = $derived(
  documents
    .filter(doc => {
      // Search filter
      const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());

      // Status filter
      const matchesStatus =
        statusFilter === "all" ||
        doc.status === statusFilter;

      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
);

// Derived statistics
let documentCount = $derived(documents.length);
let readyCount = $derived(documents.filter(d => d.status === "ready").length);
let processingCount = $derived(documents.filter(d => d.status === "processing").length);
```

#### Derived with Function Body

```typescript
// ❌ Don't use function syntax
let total = $derived(() => {
  return items.reduce((sum, item) => sum + item.price, 0);
});

// ✅ Use expression syntax
let total = $derived(
  items.reduce((sum, item) => sum + item.price, 0)
);
```

### `$effect` - Side Effects

#### Basic Effects

```typescript
let count = $state(0);

// Run whenever count changes
$effect(() => {
  console.log(`Count is now: ${count}`);
  document.title = `Count: ${count}`;
});
```

#### Cleanup Effects

```typescript
let intervalId: number | null = null;

$effect(() => {
  // Setup
  console.log("Starting interval");
  intervalId = setInterval(() => {
    console.log("Tick");
  }, 1000);

  // Cleanup (runs before next effect or on unmount)
  return () => {
    console.log("Stopping interval");
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  };
});
```

#### DOM Effects

```typescript
let messages = $state<Message[]>([]);
let messagesContainer: HTMLDivElement;

// Scroll to bottom when new messages arrive
$effect(() => {
  if (messages.length > 0 && messagesContainer) {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: "smooth"
    });
  }
});
```

#### Async Effects (Anti-Pattern!)

```typescript
// ❌ Don't use async in $effect
$effect(async () => {
  const data = await fetchData();  // ❌ BAD
  items = data;
});

// ✅ Call async function from effect
$effect(() => {
  loadData();
});

async function loadData() {
  const data = await fetchData();
  items = data;
}
```

### `$props` - Component Props

#### Basic Props

```typescript
<script lang="ts">
  interface Props {
    title: string;
    count: number;
    onUpdate: (value: number) => void;
  }

  let { title, count, onUpdate }: Props = $props();

  function handleClick() {
    onUpdate(count + 1);
  }
</script>

<div>
  <h1>{title}</h1>
  <p>Count: {count}</p>
  <button onclick={handleClick}>Increment</button>
</div>
```

#### Optional Props with Defaults

```typescript
interface Props {
  title: string;
  subtitle?: string;
  limit?: number;
  showHeader?: boolean;
}

let {
  title,
  subtitle = "",
  limit = 10,
  showHeader = true
}: Props = $props();
```

#### Rest Props

```typescript
let { class: className, ...rest } = $props<{
  class?: string;
  [key: string]: any;
}>();

// Use rest props on element
<div class={className} {...rest}>
  Content
</div>
```

### `$bindable` - Two-Way Binding

```typescript
// Child component
<script lang="ts">
  let { value = $bindable() } = $props<{ value: string }>();
</script>

<input bind:value />

// Parent component
<script lang="ts">
  let searchQuery = $state("");
</script>

<SearchInput bind:value={searchQuery} />
<!-- searchQuery updates when input changes -->
```

---

## Component Patterns

### Component File Structure

```svelte
<script lang="ts">
  // 1. Imports
  import { onMount } from "svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { apiClient } from "$lib/api/client";
  import type { User } from "$lib/types";

  // 2. Props
  let { user, onSave }: {
    user: User;
    onSave: (user: User) => void;
  } = $props();

  // 3. State
  let editing = $state(false);
  let localUser = $state({ ...user });

  // 4. Derived state
  let hasChanges = $derived(
    localUser.name !== user.name ||
    localUser.email !== user.email
  );

  // 5. Effects
  $effect(() => {
    console.log("User updated:", user);
  });

  // 6. Functions
  function handleSave() {
    onSave(localUser);
    editing = false;
  }

  function handleCancel() {
    localUser = { ...user };
    editing = false;
  }

  // 7. Lifecycle
  onMount(() => {
    console.log("Component mounted");
  });
</script>

<!-- 8. Template -->
<div class="user-card">
  {#if editing}
    <input bind:value={localUser.name} />
    <input bind:value={localUser.email} />
    <button onclick={handleSave} disabled={!hasChanges}>Save</button>
    <button onclick={handleCancel}>Cancel</button>
  {:else}
    <p>{user.name}</p>
    <p>{user.email}</p>
    <button onclick={() => editing = true}>Edit</button>
  {/if}
</div>

<!-- 9. Styles -->
<style>
  .user-card {
    padding: 1rem;
    border: 1px solid #ccc;
    border-radius: 0.5rem;
  }
</style>
```

### Composition Pattern: Slot-Based Components

```svelte
<!-- components/Card.svelte -->
<script lang="ts">
  let { title, variant = "default" }: {
    title?: string;
    variant?: "default" | "primary" | "danger";
  } = $props();
</script>

<div class="card card-{variant}">
  {#if title}
    <div class="card-header">
      <h3>{title}</h3>
      <slot name="header-actions" />
    </div>
  {/if}

  <div class="card-body">
    <slot />
  </div>

  <slot name="footer" />
</div>

<!-- Usage -->
<Card title="User Profile" variant="primary">
  <svelte:fragment slot="header-actions">
    <button>Edit</button>
  </svelte:fragment>

  <p>User content goes here</p>

  <svelte:fragment slot="footer">
    <button>Save</button>
    <button>Cancel</button>
  </svelte:fragment>
</Card>
```

### Render Props Pattern

```svelte
<!-- components/DataFetcher.svelte -->
<script lang="ts" generics="T">
  let { url, children }: {
    url: string;
    children: (data: {
      data: T | null;
      loading: boolean;
      error: Error | null;
    }) => any;
  } = $props();

  let data = $state<T | null>(null);
  let loading = $state(true);
  let error = $state<Error | null>(null);

  $effect(() => {
    loadData();
  });

  async function loadData() {
    loading = true;
    error = null;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fetch failed");
      data = await response.json();
    } catch (err) {
      error = err as Error;
    } finally {
      loading = false;
    }
  }
</script>

{@render children({ data, loading, error })}

<!-- Usage -->
<DataFetcher url="/api/users" let:data let:loading let:error>
  {#if loading}
    <p>Loading...</p>
  {:else if error}
    <p>Error: {error.message}</p>
  {:else if data}
    <ul>
      {#each data as user}
        <li>{user.name}</li>
      {/each}
    </ul>
  {/if}
</DataFetcher>
```

---

## State Management

### Local Component State

```typescript
<script lang="ts">
  // Simple local state
  let count = $state(0);
  let name = $state("");

  function increment() {
    count++;
  }
</script>
```

### Shared State (Store Pattern)

```typescript
// lib/stores/auth.svelte.ts
export function createAuthStore() {
  let user = $state<User | null>(null);
  let loading = $state(false);

  return {
    // Getters
    get user() { return user; },
    get loading() { return loading; },
    get isAuthenticated() { return user !== null; },

    // Actions
    async login(email: string, password: string) {
      loading = true;
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        user = data.user;
      } catch (error) {
        console.error("Login failed:", error);
        throw error;
      } finally {
        loading = false;
      }
    },

    async logout() {
      await supabase.auth.signOut();
      user = null;
    }
  };
}

// Singleton export
export const authStore = createAuthStore();

// Usage in components
<script lang="ts">
  import { authStore } from "$lib/stores/auth.svelte";

  const { user, isAuthenticated, login, logout } = authStore;
</script>

{#if isAuthenticated}
  <p>Welcome, {user?.email}</p>
  <button onclick={logout}>Logout</button>
{:else}
  <button onclick={() => login("user@example.com", "password")}>Login</button>
{/if}
```

### Context API (Parent-Child Communication)

```typescript
// Parent component
<script lang="ts">
  import { setContext } from "svelte";

  let projectId = $state("proj-123");

  setContext("projectId", {
    get projectId() { return projectId; }
  });
</script>

<ChildComponent />

// Child component (any depth)
<script lang="ts">
  import { getContext } from "svelte";

  const { projectId } = getContext<{ projectId: string }>("projectId");

  $effect(() => {
    console.log("Current project:", projectId);
  });
</script>
```

---

## SvelteKit Routing

### File-Based Routing

```
src/routes/
├── +layout.svelte              # Root layout
├── +page.svelte                # / (home)
├── about/
│   └── +page.svelte            # /about
├── projects/
│   ├── +page.svelte            # /projects (list)
│   └── [projectId]/
│       ├── +page.svelte        # /projects/:projectId (detail)
│       └── documents/
│           └── [documentId]/
│               └── +page.svelte   # /projects/:projectId/documents/:documentId
└── (auth)/
    ├── login/+page.svelte      # /login (grouped route)
    └── signup/+page.svelte     # /signup
```

### Route Parameters

```typescript
<script lang="ts">
  import { page } from "$app/stores";

  // Access route parameters
  const projectId = $derived($page.params.projectId);
  const documentId = $derived($page.params.documentId);

  $effect(() => {
    console.log("Project ID:", projectId);
    console.log("Document ID:", documentId);
  });
</script>
```

### Page Data Loading

```typescript
// routes/projects/[projectId]/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, fetch }) => {
  const projectId = params.projectId;

  const response = await fetch(`/api/projects/${projectId}`);
  const project = await response.json();

  return {
    project
  };
};

// routes/projects/[projectId]/+page.svelte
<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Access loaded data
  const project = $derived(data.project);
</script>

<h1>{project.name}</h1>
```

### Navigation

```typescript
<script lang="ts">
  import { goto } from "$app/navigation";

  function navigateToProject(projectId: string) {
    goto(`/projects/${projectId}`);
  }

  function navigateBack() {
    goto(-1);  // Go back
  }
</script>

<!-- Declarative navigation -->
<a href="/projects">Projects</a>
<a href="/projects/{projectId}">View Project</a>

<!-- Programmatic navigation -->
<button onclick={() => navigateToProject("proj-123")}>Go</button>
```

---

## Server-Side Rendering

### Load Function (Server-Side)

```typescript
// routes/projects/+page.server.ts
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  // Server-side only (has access to secrets)
  const userId = locals.userId;

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId);

  return {
    projects
  };
};
```

### Form Actions (Server-Side)

```typescript
// routes/projects/create/+page.server.ts
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const userId = locals.userId;

    const { data, error } = await supabase
      .from("projects")
      .insert({ name, user_id: userId })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, project: data };
  }
};

// routes/projects/create/+page.svelte
<script lang="ts">
  import { enhance } from "$app/forms";

  let formResult = $state<any>(null);
</script>

<form method="POST" use:enhance>
  <input name="name" required />
  <button>Create Project</button>
</form>

{#if formResult?.success}
  <p>Project created: {formResult.project.name}</p>
{:else if formResult?.error}
  <p>Error: {formResult.error}</p>
{/if}
```

---

## Form Handling

### Controlled Inputs

```typescript
<script lang="ts">
  let email = $state("");
  let password = $state("");
  let agreeTerms = $state(false);

  // Validation
  let emailError = $derived(
    email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? "Invalid email"
      : null
  );

  let canSubmit = $derived(
    email &&
    password.length >= 8 &&
    agreeTerms &&
    !emailError
  );

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) throw new Error("Registration failed");

      console.log("Success!");
    } catch (error) {
      console.error("Error:", error);
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <input
    type="email"
    bind:value={email}
    placeholder="Email"
  />
  {#if emailError}
    <span class="error">{emailError}</span>
  {/if}

  <input
    type="password"
    bind:value={password}
    placeholder="Password"
  />

  <label>
    <input type="checkbox" bind:checked={agreeTerms} />
    I agree to terms
  </label>

  <button type="submit" disabled={!canSubmit}>
    Register
  </button>
</form>
```

---

## API Integration

### Fetch Wrapper

```typescript
// lib/api/client.ts
export class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && { "Authorization": `Bearer ${token}` }),
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Request failed");
    }

    return response.json();
  }

  private async getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, body: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }
}

export const apiClient = new APIClient(import.meta.env.VITE_API_URL);
```

### Usage in Components

```typescript
<script lang="ts">
  import { apiClient } from "$lib/api/client";

  let documents = $state<Document[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  async function loadDocuments(projectId: string) {
    loading = true;
    error = null;

    try {
      documents = await apiClient.get<Document[]>(`/v1/projects/${projectId}/documents`);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadDocuments("proj-123");
  });
</script>

{#if loading}
  <p>Loading...</p>
{:else if error}
  <p>Error: {error}</p>
{:else}
  <ul>
    {#each documents as doc}
      <li>{doc.name}</li>
    {/each}
  </ul>
{/if}
```

---

## Performance Optimization

### Lazy Loading Components

```typescript
<script lang="ts">
  import { onMount } from "svelte";

  let HeavyComponent: any = null;
  let showHeavy = $state(false);

  onMount(async () => {
    if (showHeavy) {
      HeavyComponent = (await import("$lib/components/HeavyComponent.svelte")).default;
    }
  });
</script>

<button onclick={() => showHeavy = !showHeavy}>
  Toggle Heavy Component
</button>

{#if showHeavy && HeavyComponent}
  <svelte:component this={HeavyComponent} />
{/if}
```

### Virtual Lists

```typescript
<script lang="ts">
  import { onMount } from "svelte";

  let items = $state<string[]>([]);
  let visibleRange = $state({ start: 0, end: 20 });

  let visibleItems = $derived(
    items.slice(visibleRange.start, visibleRange.end)
  );

  function handleScroll(event: Event) {
    const container = event.target as HTMLDivElement;
    const scrollTop = container.scrollTop;
    const itemHeight = 50;

    visibleRange = {
      start: Math.floor(scrollTop / itemHeight),
      end: Math.floor(scrollTop / itemHeight) + 20
    };
  }
</script>

<div class="virtual-list" onscroll={handleScroll}>
  {#each visibleItems as item}
    <div class="item">{item}</div>
  {/each}
</div>
```

---

## Common Pitfalls

### 1. Don't Destructure $state Objects

```typescript
// ❌ Bad - loses reactivity
let { name } = $state({ name: "Alice" });
name = "Bob";  // ❌ Not reactive!

// ✅ Good - keep object reference
let user = $state({ name: "Alice" });
user.name = "Bob";  // ✅ Reactive
```

### 2. Don't Use Async in $effect

```typescript
// ❌ Bad
$effect(async () => {
  const data = await fetchData();
});

// ✅ Good
$effect(() => {
  loadData();
});

async function loadData() {
  const data = await fetchData();
}
```

### 3. Avoid Side Effects in $derived

```typescript
// ❌ Bad - side effect in derived
let total = $derived(() => {
  console.log("Calculating");  // ❌ Side effect!
  return items.reduce((sum, item) => sum + item.price, 0);
});

// ✅ Good - pure computation
let total = $derived(
  items.reduce((sum, item) => sum + item.price, 0)
);
```

---

## 🚨 Troubleshooting Common Issues

### Issue 1: $state Not Reactive

**Symptom**: Changes to `$state` variable don't trigger UI updates

**Cause**: Mutating nested objects/arrays without reassignment

**Solution**:
```typescript
// ❌ Wrong - mutation doesn't trigger reactivity
let items = $state([{ id: 1, name: "Item 1" }]);

function addItem() {
  items.push({ id: 2, name: "Item 2" });  // ❌ Won't update UI
}

// ✅ Correct - reassignment triggers reactivity
let items = $state([{ id: 1, name: "Item 1" }]);

function addItem() {
  items = [...items, { id: 2, name: "Item 2" }];  // ✅ Updates UI
}

// ✅ Alternative - use $state.raw for deeply reactive objects
let items = $state.raw([{ id: 1, name: "Item 1" }]);

function addItem() {
  items.push({ id: 2, name: "Item 2" });  // ✅ Works with $state.raw
}
```

---

### Issue 2: Infinite $effect Loop

**Symptom**: Browser hangs, "Maximum call stack size exceeded" error

**Cause**: $effect modifies a dependency it reads

**Solution**:
```typescript
// ❌ Wrong - infinite loop
let count = $state(0);

$effect(() => {
  console.log("Count:", count);
  count++;  // ❌ Modifies count, triggers effect again!
});

// ✅ Correct - use untrack for writes
let count = $state(0);

$effect(() => {
  console.log("Count:", count);
  untrack(() => {
    count++;  // ✅ Won't trigger effect
  });
});

// ✅ Better - separate read and write
let count = $state(0);
let displayCount = $derived(count);

$effect(() => {
  console.log("Count:", displayCount);
});

function increment() {
  count++;  // ✅ Controlled update
}
```

---

### Issue 3: $bindable Not Working Across Components

**Symptom**: Child component changes don't propagate to parent

**Cause**: Parent not using `bind:` directive or wrong syntax

**Solution**:
```svelte
<!-- ❌ Wrong - no bind directive -->
<!-- Parent.svelte -->
<script>
  let isOpen = $state(false);
</script>

<Child open={isOpen} />  <!-- ❌ One-way binding only -->

<!-- ✅ Correct - use bind: -->
<!-- Parent.svelte -->
<script>
  let isOpen = $state(false);
</script>

<Child bind:open={isOpen} />  <!-- ✅ Two-way binding -->

<!-- Child.svelte -->
<script>
  let { open = $bindable(false) } = $props();
</script>

<button onclick={() => open = !open}>
  Toggle
</button>
```

---

### Issue 4: Type Errors with $props()

**Symptom**: TypeScript error "Property does not exist on type"

**Cause**: Missing type parameter for $props()

**Solution**:
```typescript
// ❌ Wrong - no types
let { userId, onComplete } = $props();  // ❌ TypeScript error

// ✅ Correct - explicit interface
interface Props {
  userId: string;
  onComplete?: () => void;
}

let { userId, onComplete = () => {} } = $props<Props>();  // ✅ Type-safe

// ✅ Better - inline type
let {
  userId,
  onComplete = () => {}
} = $props<{
  userId: string;
  onComplete?: () => void;
}>();
```

---

### Issue 5: Event Handlers Not Firing

**Symptom**: `onclick`, `onsubmit` etc. don't work

**Cause**: Using old Svelte 4 syntax `on:` instead of inline handlers

**Solution**:
```svelte
<!-- ❌ Wrong - Svelte 4 syntax -->
<button on:click={handleClick}>Click</button>

<!-- ✅ Correct - Svelte 5 syntax -->
<button onclick={handleClick}>Click</button>

<!-- Event with payload -->
<button onclick={(e) => handleClick(e, userId)}>
  Click
</button>

<!-- Prevent default -->
<form onsubmit={(e) => {
  e.preventDefault();
  handleSubmit();
}}>
  <button type="submit">Submit</button>
</form>
```

---

### Issue 6: Component Not Re-rendering on Prop Change

**Symptom**: Component doesn't update when parent changes prop

**Cause**: Using `let` instead of accessing prop directly

**Solution**:
```typescript
// ❌ Wrong - destructures once, won't update
let { count } = $props<{ count: number }>();

function double() {
  return count * 2;  // ❌ Stale value
}

// ✅ Correct - keep props object
let props = $props<{ count: number }>();

function double() {
  return props.count * 2;  // ✅ Always current
}

// ✅ Alternative - use $derived
let { count } = $props<{ count: number }>();
let doubleCount = $derived(count * 2);  // ✅ Reactive
```

---

### Issue 7: Route Data Not Loading (SvelteKit)

**Symptom**: `+page.server.ts` load function runs but data is `undefined`

**Cause**: Not returning data from load function or incorrect export

**Solution**:
```typescript
// ❌ Wrong - missing return
// +page.server.ts
export async function load({ params }) {
  const data = await fetchData(params.id);
  // ❌ No return!
}

// ✅ Correct - return data
// +page.server.ts
export async function load({ params }) {
  const data = await fetchData(params.id);
  return { data };  // ✅ Returns object
}

// +page.svelte
<script lang="ts">
  let { data } = $props();  // ✅ Access via $props
</script>

<div>{data.data.title}</div>
```

---

### Issue 8: DaisyUI Classes Not Working

**Symptom**: DaisyUI utility classes have no effect

**Cause**: TailwindCSS not processing DaisyUI plugin or wrong config

**Solution**:
```javascript
// tailwind.config.js
export default {
  content: [
    './src/**/*.{html,js,svelte,ts}'  // ✅ Include .svelte files
  ],
  plugins: [
    require('daisyui')  // ✅ Load DaisyUI plugin
  ],
  daisyui: {
    themes: ["light", "dark", "cupcake"],  // ✅ Enable themes
  }
}
```

**Debugging**:
```bash
# Check if Tailwind is running
npm run dev  # Should show Tailwind rebuild messages

# Verify DaisyUI is installed
npm list daisyui

# Clear cache and rebuild
rm -rf .svelte-kit
npm run dev
```

---

## Related Documentation

- [Design Principles](design-principles.md) - Coding standards
- [Overview](overview.md) - Project overview
- [Deno Conventions](deno-conventions.md) - API patterns

---

**Last Updated**: 2025-11-29
**Maintained By**: InsightSphere Frontend Team
