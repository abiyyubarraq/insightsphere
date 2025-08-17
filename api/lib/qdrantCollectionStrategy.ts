/**
 * Qdrant Collection Strategy Configuration
 * 
 * This file defines different collection strategies for organizing vector data.
 * Similar to Firestore's hierarchical path structure: users/userId/projects/projectId
 */

export type CollectionStrategy = 
	| "per-user"         // One collection per user: insightsphere_user_{userId}
	| "per-project"      // One collection per project: insightsphere_user_{userId}_project_{projectId}
	| "single";          // One collection for all: insightsphere-docs (with metadata filtering)

export interface CollectionConfig {
	strategy: CollectionStrategy;
	baseCollectionName: string;
}

/**
 * Collection Strategy Examples:
 * 
 * PER-USER STRATEGY (Recommended):
 * ✅ Collection: "insightsphere_user_abc123"
 * ✅ Metadata: { projectId: "proj1", documentId: "doc1", pageNumber: 5 }
 * ✅ Benefits: User isolation, GDPR compliance, better performance
 * 
 * PER-PROJECT STRATEGY:
 * ✅ Collection: "insightsphere_user_abc123_project_proj1"
 * ✅ Metadata: { documentId: "doc1", pageNumber: 5 }
 * ✅ Benefits: Perfect project isolation, easy project deletion
 * 
 * SINGLE STRATEGY:
 * ✅ Collection: "insightsphere-docs"
 * ✅ Metadata: { userId: "abc123", projectId: "proj1", documentId: "doc1", pageNumber: 5 }
 * ❌ Issues: No isolation, harder to scale, GDPR compliance issues
 */

// Default configuration
export const defaultCollectionConfig: CollectionConfig = {
	strategy: "per-project",
	baseCollectionName: "insightsphere"
};

/**
 * Usage Examples:
 * 
 * // Store documents using per-user collections
 * await qdrantService.upsertChunks(chunks, { useProjectCollection: false });
 * 
 * // Store documents using per-project collections  
 * await qdrantService.upsertChunks(chunks, { useProjectCollection: true });
 * 
 * // Search in user's all projects
 * await qdrantService.searchSimilar(queryVector, {
 *   userId: "abc123",
 *   projectId: "proj1", // Filter by project within user collection
 *   useProjectCollection: false
 * });
 * 
 * // Search in specific project collection
 * await qdrantService.searchSimilar(queryVector, {
 *   userId: "abc123", 
 *   projectId: "proj1",
 *   useProjectCollection: true // Search only in project-specific collection
 * });
 */
