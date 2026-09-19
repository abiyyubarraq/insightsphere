import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface FileDownloadResult {
  data: Uint8Array;
  contentType?: string;
  fileName?: string;
}

export interface DocumentRecord {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  user_id: string;
  status: "uploading" | "processing" | "ready" | "failed";
  processing_error?: string | null;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  image_paths?: Record<number, string>;
}

export interface DocumentPageRecord {
  id: string;
  document_id: string;
  page_number: number;
  ocr_text: string;
  char_count: number;
  extraction_method: "ocr" | "native";
  image_storage_path?: string | null;
  created_at: string;
  updated_at: string;
}

export class SupabaseService {
  private client: SupabaseClient;
  private bucketName: string;

  constructor() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
      );
    }

    this.client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.bucketName =
      Deno.env.get("SUPABASE_STORAGE_BUCKET") || "anotherbrainfileplayground";
  }

  /**
   * Download a file from Supabase Storage
   */
  async downloadFile(storagePath: string): Promise<FileDownloadResult> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .download(storagePath);

      if (error) {
        throw new Error(`Failed to download file: ${error.message}`);
      }

      if (!data) {
        throw new Error("No file data received");
      }

      // Convert Blob to Uint8Array
      const arrayBuffer = await data.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      return {
        data: uint8Array,
        contentType: data.type,
        fileName: storagePath.split("/").pop(),
      };
    } catch (error) {
      console.error("File download failed:", error);
      throw new Error(
        `Failed to download file from storage: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    data: Uint8Array,
    storagePath: string,
    contentType: string
  ): Promise<string> {
    try {
      // Convert Uint8Array to ArrayBuffer for Blob compatibility
      // Create a new ArrayBuffer copy to ensure proper type compatibility
      const arrayBuffer = new ArrayBuffer(data.length);
      new Uint8Array(arrayBuffer).set(data);
      const blob = new Blob([arrayBuffer], { type: contentType });

      const { data: uploadData, error } = await this.client.storage
        .from(this.bucketName)
        .upload(storagePath, blob, {
          contentType,
          upsert: false,
          cacheControl: "3600",
        });

      if (error) {
        throw new Error(`Failed to upload file: ${error.message}`);
      }

      if (!uploadData) {
        throw new Error("No upload data received");
      }

      console.log(`✅ Uploaded file to storage: ${storagePath}`);
      return uploadData.path;
    } catch (error) {
      console.error("File upload failed:", error);
      throw new Error(
        `Failed to upload file to storage: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get document record by ID and validate ownership
   */
  async getDocument(
    documentId: string,
    userId: string
  ): Promise<DocumentRecord> {
    try {
      const { data, error } = await this.client
        .from("project_files")
        .select("*")
        .eq("id", documentId)
        .eq("user_id", userId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch document: ${error.message}`);
      }

      if (!data) {
        throw new Error("Document not found or access denied");
      }

      return data as DocumentRecord;
    } catch (error) {
      console.error("Document fetch failed:", error);
      throw new Error(
        `Failed to fetch document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Update document status and metadata
   */
  async updateDocument(
    documentId: string,
    updates: {
      status?: DocumentRecord["status"];
      processing_error?: string | null;
      summary?: string | null;
      metadata?: Record<string, unknown>;
      is_summary_exist?: boolean;
      image_paths?: Record<number, string>;
    }
  ): Promise<void> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        ...updates,
      };

      const { error } = await this.client
        .from("project_files")
        .update(updateData)
        .eq("id", documentId);

      if (error) {
        throw new Error(`Failed to update document: ${error.message}`);
      }

      console.log(`Document ${documentId} updated successfully`);
    } catch (error) {
      console.error("Document update failed:", error);
      throw new Error(
        `Failed to update document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Validate user has access to project
   */
  async validateProjectAccess(
    projectId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Project access validation failed:", error);
      return false;
    }
  }

  /**
   * Get user info from JWT token
   */
  async getUserFromToken(
    token: string
  ): Promise<{ id: string; email?: string }> {
    try {
      const {
        data: { user },
        error,
      } = await this.client.auth.getUser(token);

      if (error || !user) {
        throw new Error("Invalid or expired token");
      }

      return {
        id: user.id,
        email: user.email,
      };
    } catch (error) {
      console.error("Token validation failed:", error);
      throw new Error("Authentication failed");
    }
  }

  /**
   * Create a temporary file for processing
   */
  async createTempFile(data: Uint8Array, fileName: string): Promise<string> {
    try {
      // Use shared /tmp directory that's mounted in both API and doc-parser containers
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const tempDir = `/tmp/insightsphere_${timestamp}_${randomId}`;

      // Create the directory
      await Deno.mkdir(tempDir, { recursive: true });

      const tempPath = `${tempDir}/${fileName}`;
      await Deno.writeFile(tempPath, data);

      console.log(`📁 Created temp file: ${tempPath}`);
      return tempPath;
    } catch (error) {
      console.error("Failed to create temp file:", error);
      throw new Error(
        `Failed to create temporary file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Clean up temporary file
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      // Remove the file first
      await Deno.remove(filePath);
      console.log(`🗑️ Removed temp file: ${filePath}`);

      // Remove the parent directory (should be empty now)
      const dir = filePath.split("/").slice(0, -1).join("/");
      if (dir && dir.includes("insightsphere_")) {
        try {
          await Deno.remove(dir);
          console.log(`🗑️ Removed temp directory: ${dir}`);
        } catch {
          // Ignore errors when removing directory (it might not be empty)
          console.log(
            `⚠️ Could not remove temp directory: ${dir} (might not be empty)`
          );
        }
      }
    } catch (error) {
      console.warn("Failed to cleanup temp file:", error);
      // Don't throw here, just log the warning
    }
  }

  /**
   * Check if user has access to a specific project
   */
  async userHasProjectAccess(
    userId: string,
    projectId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await this.client
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        console.log(
          `❌ User ${userId} does not have access to project ${projectId}`
        );
        return false;
      }

      console.log(`✅ User ${userId} has access to project ${projectId}`);
      return true;
    } catch (error) {
      console.error("Error checking project access:", error);
      return false;
    }
  }

  /**
   * Get a public/signed URL for a file in Supabase Storage
   */
  async getPublicUrl(storagePath: string): Promise<string> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) {
        throw new Error(`Failed to generate URL: ${error.message}`);
      }

      if (!data?.signedUrl) {
        throw new Error("No URL data received");
      }

      return data.signedUrl;
    } catch (error) {
      console.error("Failed to get public URL:", error);
      throw new Error(
        `Failed to get public URL: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Store per-page OCR results using UPSERT for idempotency
   * Handles reprocessing by updating existing pages
   */
  async storeDocumentPages(
    documentId: string,
    pages: Array<{ page_number: number; text: string }>,
    imagePaths?: Record<number, string>
  ): Promise<void> {
    try {
      const pageRecords = pages.map((page) => ({
        document_id: documentId,
        page_number: page.page_number,
        ocr_text: page.text,
        char_count: page.text.length,
        extraction_method: "ocr" as const,
        image_storage_path: imagePaths?.[page.page_number] || null,
      }));

      const { error } = await this.client
        .from("document_pages")
        .upsert(pageRecords, {
          onConflict: "document_id,page_number",
          ignoreDuplicates: false, // Update existing
        });

      if (error) {
        throw new Error(`Failed to store document pages: ${error.message}`);
      }

      console.log(
        `✅ Stored ${pageRecords.length} pages for document ${documentId}`
      );
    } catch (error) {
      console.error("Document pages storage failed:", error);
      throw new Error(
        `Failed to store document pages: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Every object under a prefix, walking into folders.
   *
   * Storage list() only returns one level, and processing writes page images to
   * {user}/{project}/images/{document}/page-N.png, so deleting a project means
   * walking down to them.
   */
  async listStorageFiles(prefix: string): Promise<string[]> {
    const found: string[] = [];

    const walk = async (dir: string): Promise<void> => {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .list(dir, { limit: 1000 });

      if (error || !data) return;

      for (const entry of data) {
        const full = dir ? `${dir}/${entry.name}` : entry.name;
        // Storage marks folders by returning a null id.
        if (entry.id === null) await walk(full);
        else found.push(full);
      }
    };

    await walk(prefix.replace(/\/$/, ""));
    return found;
  }

  async deleteStorageFiles(paths: string[]): Promise<number> {
    if (paths.length === 0) return 0;

    // The API rejects very large batches, so chunk it.
    let removed = 0;
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await this.client.storage
        .from(this.bucketName)
        .remove(batch);
      if (error) {
        console.warn(`Failed to remove ${batch.length} objects:`, error.message);
        continue;
      }
      removed += batch.length;
    }
    return removed;
  }

  /** Removes the row. document_pages and chat_citations cascade from it. */
  async deleteDocumentRow(documentId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from("project_files")
      .delete()
      .eq("id", documentId)
      .eq("user_id", userId);

    if (error) throw new Error(`Failed to delete document: ${error.message}`);
  }

  /** Removes the row. project_files and chat_conversations cascade from it. */
  async deleteProjectRow(projectId: string, userId: string): Promise<void> {
    const { error } = await this.client
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);

    if (error) throw new Error(`Failed to delete project: ${error.message}`);
  }

  /**
   * Marks documents abandoned mid-processing as failed.
   *
   * Processing runs in-process, so anything that stops the server strands
   * whatever was running. Called once at startup.
   */
  async failStalledDocuments(olderThanMinutes = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
      .toISOString();

    const { data, error } = await this.client
      .from("project_files")
      .update({
        status: "failed",
        processing_error:
          "Processing was interrupted before it finished. Try again.",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .select("id");

    if (error) {
      console.warn("Could not reset stalled documents:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  }

  /**
   * Get the Supabase client instance
   */
  getClient(): SupabaseClient {
    // Return the internal Supabase client
    return this.client;
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService();
