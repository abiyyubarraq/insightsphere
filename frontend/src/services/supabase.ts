import { createClient, type User } from '@supabase/supabase-js';
import type {
  GetConversationHistoryResponse,
  SendMessageRequest,
  SendMessageResponse,
} from '../../../shared/types/chat';
import type { Project, ProjectFile } from '../stores/project';
import type { FileLibraryItem, ListFilesResponse } from '../../../shared/types/index';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/v1';

/**
 * Send a chat message to the project (conversational RAG)
 */
export const sendChatMessage = async (
  projectId: string,
  message: string,
  conversationId?: string,
  options?: SendMessageRequest['options']
): Promise<SendMessageResponse> => {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) throw new Error('Not authenticated');

  const request: SendMessageRequest = {
    message,
    conversation_id: conversationId,
    options: options || {
      max_chunks: 20,
      similarity_threshold: 0.25,
      use_conversation_history: true,
      max_history_messages: 10,
    },
  };

  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || 'Failed to send message');
  }

  const data: SendMessageResponse = await response.json();
  return data;
};

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
  if (error || !data.user) {
    throw new Error(error?.message || 'Failed to create account');
  }
  return data.user;
};

// Email & Password Sign-In
export const signInWithEmail = async (email: string, password: string): Promise<User> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(error?.message || 'Failed to sign in');
  }
  return data.user;
};

// Sign-Out
export const logout = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

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

export const updateProject = async (
  projectId: string,
  userId: string,
  name: string
): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .update({ name })
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Project;
};

export const deleteProject = async (projectId: string, userId: string): Promise<void> => {
  // First, get all files in the project to delete them from storage
  const { data: files, error: filesError } = await supabase
    .from('project_files')
    .select('storage_path')
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (filesError) throw new Error(filesError.message);

  // Delete files from storage if any exist
  if (files && files.length > 0) {
    const storagePaths = files.map((f) => f.storage_path).filter(Boolean);
    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('anotherbrainfileplayground')
        .remove(storagePaths);

      if (storageError) throw new Error(storageError.message);
    }
  }

  // Delete project files from database
  const { error: filesDeleteError } = await supabase
    .from('project_files')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (filesDeleteError) throw new Error(filesDeleteError.message);

  // Finally, delete the project itself
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
};

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
    .select(
      'id, project_id, file_name, storage_path, file_id, created_at, user_id, status, is_summary_exist'
    )
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return data.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ) as ProjectFile[];
};

export const getProjectFileSummary = async (projectId: string, userId: string) => {
  const { data, error } = await supabase
    .from('project_files')
    .select('id, summary')
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return data as { id: string; summary: string | null }[];
};

/**
 * Generate a summary for a document using the AI service
 */
export const generateDocumentSummary = async (
  projectId: string,
  documentId: string,
  storagePath: string
): Promise<{
  success: boolean;
  document_id: string;
  processing_time_ms: number;
  error?: string;
}> => {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/documents/generateSummary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: projectId,
      document_id: documentId,
      storage_path: storagePath,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to generate summary');
  }

  return await response.json();
};

export const downloadFile = async (storagePath: string): Promise<void> => {
  try {
    // Get the file from Supabase storage
    const { data, error } = await supabase.storage
      .from('anotherbrainfileplayground')
      .download(storagePath);

    if (error) throw new Error(error.message);
    if (!data) throw new Error('File not found');

    // Create a blob URL and trigger download
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;

    // Extract filename from storage path
    const fileName = storagePath.split('/').pop() || 'download';
    link.download = fileName;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the blob URL
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to download file');
  }
};

export const getFileUrl = async (storagePath: string): Promise<string> => {
  try {
    const { data, error } = await supabase.storage
      .from('anotherbrainfileplayground')
      .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) throw new Error(error.message);
    if (!data?.signedUrl) throw new Error('Failed to generate download URL');

    return data.signedUrl;
  } catch (error) {
    console.error('Failed to get file URL:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to generate download URL');
  }
};

/**
 * Get all files from user's projects with filtering and pagination
 */
export const searchFiles = async (
  options: {
    limit?: number;
    offset?: number;
    projectIds?: string[];
    searchQuery?: string;
    searchMode?: 'filename' | 'semantic' | 'typesense';
  } = {}
): Promise<ListFilesResponse> => {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) throw new Error('Not authenticated');

  const {
    limit = 100,
    offset = 0,
    projectIds = [],
    searchQuery = '',
    searchMode = 'filename',
  } = options;

  // Request body for POST method
  const requestBody = {
    limit,
    offset,
    searchQuery: searchQuery || undefined,
    searchMode: searchQuery ? searchMode : undefined,
    projectIds: projectIds.length > 0 ? projectIds : undefined,
  };

  const response = await fetch(`${API_BASE_URL}/searchFiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || 'Failed to fetch files');
  }

  const data: ListFilesResponse = await response.json();
  return data;
};

/**
 * Get conversation history for a project (direct Supabase query)
 */
export const getConversationHistory = async (
  projectId: string,
  limit = 50
): Promise<GetConversationHistoryResponse> => {
  const session = await supabase.auth.getSession();
  if (!session.data.session) throw new Error('Not authenticated');

  const userId = session.data.session.user.id;

  try {
    // Get or create conversation
    let { data: conversation, error: convError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (convError && convError.code !== 'PGRST116') {
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      const { data: newConv, error: createError } = await supabase
        .from('chat_conversations')
        .insert({
          project_id: projectId,
          user_id: userId,
          title: 'New Conversation',
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create conversation: ${createError.message}`);
      }
      conversation = newConv;
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (messagesError) {
      throw new Error(`Failed to get messages: ${messagesError.message}`);
    }

    // Get citations for assistant messages
    const assistantMessageIds =
      messages?.filter((m) => m.role === 'assistant').map((m) => m.id) || [];

    let citations: any[] = [];
    if (assistantMessageIds.length > 0) {
      const { data: citationsData, error: citationsError } = await supabase
        .from('chat_citations')
        .select('*')
        .in('message_id', assistantMessageIds)
        .order('similarity_score', { ascending: false });

      if (citationsError) {
        console.warn('Failed to get citations:', citationsError);
      } else {
        citations = citationsData || [];
      }
    }

    // Group citations by message_id
    const citationsByMessage = citations.reduce(
      (acc, citation) => {
        if (!acc[citation.message_id]) {
          acc[citation.message_id] = [];
        }
        acc[citation.message_id].push(citation);
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Attach citations to messages
    const messagesWithCitations =
      messages?.map((message) => ({
        ...message,
        citations: message.role === 'assistant' ? citationsByMessage[message.id] || [] : undefined,
      })) || [];

    return {
      success: true,
      conversation,
      messages: messagesWithCitations,
      has_more: messagesWithCitations.length >= limit,
    };
  } catch (error) {
    console.error('Failed to get conversation history:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to load conversation history');
  }
};

/**
 * Delete conversation history for a project (direct Supabase query)
 */
export const deleteConversationHistory = async (projectId: string): Promise<void> => {
  const session = await supabase.auth.getSession();
  if (!session.data.session) throw new Error('Not authenticated');

  const userId = session.data.session.user.id;

  try {
    // Get conversation
    const { data: conversation, error: convError } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (convError) {
      if (convError.code === 'PGRST116') {
        // Conversation doesn't exist, nothing to delete
        return;
      }
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    if (!conversation) return;

    // Delete conversation (cascades to messages and citations)
    const { error: deleteError } = await supabase
      .from('chat_conversations')
      .delete()
      .eq('id', conversation.id)
      .eq('user_id', userId);

    if (deleteError) {
      throw new Error(`Failed to delete conversation: ${deleteError.message}`);
    }
  } catch (error) {
    console.error('Failed to delete conversation history:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to delete conversation');
  }
};

/**
 * Process a document (extract text, generate embeddings, store in Qdrant)
 */
export const processDocument = async (
  projectId: string,
  documentId: string,
  storagePath: string
): Promise<{
  success: boolean;
  document_id: string;
  chunks_created: number;
  processing_time_ms: number;
  error?: string;
}> => {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/documents/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      project_id: projectId,
      document_id: documentId,
      storage_path: storagePath,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.details || 'Failed to process document');
  }

  const data = await response.json();
  return data;
};
