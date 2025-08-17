import { createClient, type User } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
  },
});

// Google OAuth Sign-In / Sign-Up
export const signInWithGoogle = async (): Promise<void> => {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
  if (error) throw new Error(error.message);
};

// Email & Password Sign-Up
export const signUpWithEmail = async (
  email: string,
  password: string,
  fullName: string
): Promise<User> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });
  if (error || !data.user) throw new Error(error?.message || 'Failed to create account');
  return data.user;
};

// Email & Password Sign-In
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(error?.message || 'Failed to sign in');
  return data.user;
};

// Sign-Out
export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

// PROJECT HELPERS
import type { Project, ProjectFile } from '../stores/project';

export const fetchProjects = async (userId: string): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return data as Project[];
};

export const createProject = async (userId: string, name: string): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name, created_at: new Date() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
};

// ---------------- DOCUMENT UPLOAD ----------------

export const uploadDocument = async (file: File, projectId: string, userId: string) => {
  if (!file) throw new Error('No file selected');

  const filePath = `${userId}/${projectId}/${Date.now()}_${file.name}`;

  const { data, error } = await supabase.storage
    .from('anotherbrainfileplayground')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw new Error(error.message);

  // Insert DB record
  const { error: fileError } = await supabase.from('project_files').insert({
    project_id: projectId,
    file_name: file.name,
    storage_path: data.path,
    created_at: new Date(),
    user_id: userId,
    file_id: data.id,
  });

  if (fileError) throw new Error(fileError.message);

  return { path: data.path, fileId: data.id };
};

export const deleteDocument = async (fileId: string, projectId: string, userId: string) => {
  // First get the file record to get the storage path
  const { data: fileData, error: fetchError } = await supabase
    .from('project_files')
    .select('storage_path')
    .eq('id', fileId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (!fileData?.storage_path) throw new Error('File not found');

  // Delete from storage first
  const { error: storageError } = await supabase.storage
    .from('anotherbrainfileplayground')
    .remove([fileData.storage_path]);

  if (storageError) throw new Error(storageError.message);

  // Then delete the database record
  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('id', fileId)
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  return { success: true };
};

export const getProjectFiles = async (projectId: string, userId: string) => {
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data as ProjectFile[];
};
