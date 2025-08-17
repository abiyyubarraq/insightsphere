import { writable } from 'svelte/store';
export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  created_at: string;
  user_id: string;
  file_id: string;
}

export const projects = writable<Project[]>([]);
export const selectedProject = writable<Project | null>(null);
