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
	created_at: string;
	updated_at: string;
	metadata?: Record<string, any>;
}

export class SupabaseService {
	private client: SupabaseClient;
	private bucketName: string;

	constructor() {
		const supabaseUrl = Deno.env.get("SUPABASE_URL");
		const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
		if (!supabaseUrl || !supabaseServiceKey) {
			throw new Error("Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
		}

		this.client = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});

		this.bucketName = Deno.env.get("SUPABASE_STORAGE_BUCKET") || "anotherbrainfileplayground";
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
			throw new Error(`Failed to download file from storage: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	/**
	 * Get document record by ID and validate ownership
	 */
	async getDocument(documentId: string, userId: string): Promise<DocumentRecord> {
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
			throw new Error(`Failed to fetch document: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	/**
	 * Get document record by ID as admin (bypasses user ownership check)
	 */
	async getDocumentAsAdmin(documentId: string): Promise<DocumentRecord> {
		try {
			const { data, error } = await this.client
				.from("project_files")
				.select("*")
				.eq("id", documentId)
				.single();

			if (error) {
				throw new Error(`Failed to fetch document: ${error.message}`);
			}

			if (!data) {
				throw new Error("Document not found");
			}

			console.log(`🔑 Admin: Retrieved document ${documentId} for user ${data.user_id}`);
			return data as DocumentRecord;
		} catch (error) {
			console.error("Admin document fetch failed:", error);
			throw new Error(`Failed to fetch document as admin: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	/**
	 * Update document status and metadata
	 */
	async updateDocument(
		documentId: string,
		updates: {
			status?: DocumentRecord["status"];
			metadata?: Record<string, any>;
		}
	): Promise<void> {
		try {
			const updateData: any = {
				updated_at: new Date().toISOString(),
				...updates
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
			throw new Error(`Failed to update document: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	/**
	 * Validate user has access to project
	 */
	async validateProjectAccess(projectId: string, userId: string): Promise<boolean> {
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
	async getUserFromToken(token: string): Promise<{ id: string; email?: string }> {
		try {
			const { data: { user }, error } = await this.client.auth.getUser(token);

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
			throw new Error(`Failed to create temporary file: ${error instanceof Error ? error.message : "Unknown error"}`);
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
					console.log(`⚠️ Could not remove temp directory: ${dir} (might not be empty)`);
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
	async userHasProjectAccess(userId: string, projectId: string): Promise<boolean> {
		try {
			const { data, error } = await this.client
				.from("projects")
				.select("id")
				.eq("id", projectId)
				.eq("user_id", userId)
				.single();

			if (error || !data) {
				console.log(`❌ User ${userId} does not have access to project ${projectId}`);
				return false;
			}

			console.log(`✅ User ${userId} has access to project ${projectId}`);
			return true;
		} catch (error) {
			console.error("Error checking project access:", error);
			return false;
		}
	}
}

// Export singleton instance
export const supabaseService = new SupabaseService();