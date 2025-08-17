import { Context } from "hono";
import { qdrantService } from "../../lib/qdrantClient.ts";
import { openaiClient } from "../../lib/openaiClient.ts";
import { processDocument } from "../documents/process.ts";

/**
 * Web-based test endpoints for easy browser testing
 * Access these via GET requests in your browser
 */

// Test dashboard - shows all available tests
export async function testDashboard(c: Context) {
	const html = `
	<!DOCTYPE html>
	<html>
	<head>
		<title>InsightSphere Test Dashboard</title>
		<style>
			body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
			.container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
			h1 { color: #703bf7; }
			.test-card { border: 1px solid #ddd; margin: 15px 0; padding: 20px; border-radius: 5px; background: #fafafa; }
			.test-card h3 { margin-top: 0; color: #333; }
			.test-link { display: inline-block; background: #703bf7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 5px 10px 5px 0; }
			.test-link:hover { background: #5a2cc5; }
			.warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
			.info { background: #e3f2fd; border: 1px solid #bbdefb; color: #0d47a1; padding: 15px; border-radius: 5px; margin: 20px 0; }
			code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
		</style>
	</head>
	<body>
		<div class="container">
			<h1>🧪 InsightSphere Test Dashboard</h1>
			<p>Click the test links below to run individual tests. Results will be displayed as JSON.</p>
			
			<div class="warning">
				<strong>⚠️ Admin Mode Enabled:</strong><br>
				Using Legacy JWT secret for admin access. All documents and projects are accessible. Set <code>LEGACY_JWT_SECRET</code> environment variable.
			</div>

			<div class="test-card">
				<h3>🩺 System Health Tests</h3>
				<p>Test basic system connectivity and health</p>
				<a href="/v1/test/health" class="test-link">API Health</a>
				<a href="/v1/test/qdrant" class="test-link">Qdrant Status</a>
				<a href="/v1/test/openai" class="test-link">OpenAI Connection</a>
			</div>

			<div class="test-card">
				<h3>🔧 Configuration</h3>
				<p>View and update test configuration</p>
				<a href="/v1/test/config" class="test-link">View Config</a>
				<a href="/v1/test/config/form" class="test-link">Update Config</a>
			</div>

			<div class="test-card">
				<h3>📄 Document Processing Tests</h3>
				<p>Test the complete document processing pipeline</p>
				<a href="/v1/test/process" class="test-link">Process Document (Direct)</a>
				<a href="/v1/test/process-http" class="test-link">Process Document (HTTP)</a>
				<a href="/v1/test/documents" class="test-link">List Documents</a>
			</div>

			<div class="test-card">
				<h3>🔍 Vector Search Tests</h3>
				<p>Test vector storage and search functionality</p>
				<a href="/v1/test/vectors" class="test-link">Vector Stats</a>
				<a href="/v1/test/search?query=test" class="test-link">Search Test</a>
			</div>

			<div class="info">
				<strong>💡 Pro Tips:</strong><br>
				• Keep this dashboard open in one tab while testing<br>
				• Check browser network tab for detailed request/response info<br>
				• Use browser dev tools to modify URLs with query parameters<br>
				• All endpoints return JSON for easy debugging
			</div>
		</div>
	</body>
	</html>
	`;
	
	c.header("Content-Type", "text/html");
	return c.html(html);
}

// Store test configuration in memory (you might want to use a file or env vars)
let testConfig = {
	project_id: "7fe82471-199f-4d7d-8785-5b81973ef588",
	document_id: "dd4726e9-53fc-4c0d-ad16-75b189188a03", 
	storage_path: "e4ad1e3d-20b6-4802-a4f2-43b49d0c594b/7fe82471-199f-4d7d-8785-5b81973ef588/1754754046022_3717823.3718133-1-2.pdf",
	user_id: "e4ad1e3d-20b6-4802-a4f2-43b49d0c594b", // Add user_id to config
	legacy_jwt_secret: Deno.env.get("LEGACY_JWT_SECRET") || "YOUR_LEGACY_JWT_SECRET_HERE",
	auth_mode: "admin", // "admin" or "user"
	last_updated: new Date().toISOString()
};

// Helper function to get current config
function getConfig() {
	return testConfig;
}

// Configuration endpoints
export function getTestConfig(c: Context) {
	return c.json({
		success: true,
		config: testConfig,
		note: "Update config via /v1/test/config/form or POST to /v1/test/config"
	});
}

export async function updateTestConfig(c: Context) {
	try {
		const body = await c.req.json();
		testConfig = {
			...testConfig,
			...body,
			last_updated: new Date().toISOString()
		};
		
		return c.json({
			success: true,
			message: "Configuration updated successfully",
			config: testConfig
		});
	} catch (error) {
		return c.json({
			success: false,
			error: "Invalid JSON body"
		}, 400);
	}
}

export async function configForm(c: Context) {
	const html = `
	<!DOCTYPE html>
	<html>
	<head>
		<title>Test Configuration</title>
		<style>
			body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
			.container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
			h1 { color: #703bf7; }
			form { margin: 20px 0; }
			label { display: block; margin: 15px 0 5px 0; font-weight: bold; }
			input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }
			button { background: #703bf7; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; margin: 10px 5px 10px 0; }
			button:hover { background: #5a2cc5; }
			.current-config { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
			.back-link { color: #703bf7; text-decoration: none; }
		</style>
	</head>
	<body>
		<div class="container">
			<h1>🔧 Test Configuration</h1>
			<a href="/v1/test/dashboard" class="back-link">← Back to Dashboard</a>
			
			<div class="current-config">
				<h3>Current Configuration:</h3>
				<pre id="current-config">${JSON.stringify(testConfig, null, 2)}</pre>
			</div>

			<form id="config-form">
				<label for="project_id">Project ID:</label>
				<input type="text" id="project_id" name="project_id" value="${testConfig.project_id}" required>
				
				<label for="document_id">Document ID:</label>
				<input type="text" id="document_id" name="document_id" value="${testConfig.document_id}" required>
				
				<label for="storage_path">Storage Path:</label>
				<input type="text" id="storage_path" name="storage_path" value="${testConfig.storage_path}" required>
				
				<label for="auth_mode">Authentication Mode:</label>
				<select id="auth_mode" name="auth_mode" required>
					<option value="admin" ${testConfig.auth_mode === "admin" ? "selected" : ""}>Admin (Legacy JWT)</option>
					<option value="user" ${testConfig.auth_mode === "user" ? "selected" : ""}>User (Supabase JWT)</option>
				</select>
				
				<label for="legacy_jwt_secret">Legacy JWT Secret:</label>
				<textarea id="legacy_jwt_secret" name="legacy_jwt_secret" rows="3" required>${testConfig.legacy_jwt_secret}</textarea>
				<small>Admin mode: Use LEGACY_JWT_SECRET. User mode: Use Supabase JWT token.</small>
				
				<button type="submit">Update Configuration</button>
			</form>

			<script>
				document.getElementById('config-form').addEventListener('submit', async (e) => {
					e.preventDefault();
					
					const formData = new FormData(e.target);
					const config = Object.fromEntries(formData);
					
					try {
						const response = await fetch('/v1/test/config', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(config)
						});
						
						const result = await response.json();
						
						if (result.success) {
							alert('Configuration updated successfully!');
							document.getElementById('current-config').textContent = JSON.stringify(result.config, null, 2);
						} else {
							alert('Error: ' + result.error);
						}
					} catch (error) {
						alert('Network error: ' + error.message);
					}
				});
			</script>
		</div>
	</body>
	</html>
	`;
	
	c.header("Content-Type", "text/html");
	return c.html(html);
}

// Health check tests
export async function testApiHealth(c: Context) {
	return c.json({
		success: true,
		service: "InsightSphere API",
		status: "healthy",
		timestamp: new Date().toISOString(),
		version: "1.0.0",
		uptime: process.uptime ? `${process.uptime()}s` : "N/A",
		environment: {
			deno: Deno.version.deno,
			node_env: Deno.env.get("NODE_ENV") || "development"
		}
	});
}

export async function testQdrant(c: Context) {
	try {
		const testConfig = getConfig();
		const info = await qdrantService.getCollectionInfo(testConfig.user_id, testConfig.project_id);
		return c.json({
			success: true,
			service: "Qdrant",
			status: "connected",
			collection_name: "insightsphere-docs",
			collection_info: info,
			qdrant_url: Deno.env.get("QDRANT_URL") || "http://localhost:6333"
		});
	} catch (error) {
		return c.json({
			success: false,
			service: "Qdrant",
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
			qdrant_url: Deno.env.get("QDRANT_URL") || "http://localhost:6333"
		}, 500);
	}
}

export async function testOpenAI(c: Context) {
	try {
		// Test with a small embedding request
		const testResult = await openaiClient.generateEmbedding({
			text: "This is a test embedding request",
			model: "text-embedding-3-small"
		});
		
		return c.json({
			success: true,
			service: "OpenAI",
			status: "connected",
			test_embedding_dimensions: testResult.embedding.length,
			tokens_used: testResult.usage.total_tokens,
			model: "text-embedding-3-small",
			api_key_configured: !!Deno.env.get("OPENAI_API_KEY")
		});
	} catch (error) {
		return c.json({
			success: false,
			service: "OpenAI",
			status: "error",
			error: error instanceof Error ? error.message : "Unknown error",
			api_key_configured: !!Deno.env.get("OPENAI_API_KEY")
		}, 500);
	}
}

// Document processing tests
export async function testDocumentProcess(c: Context) {
	try {
		if (testConfig.legacy_jwt_secret === "YOUR_LEGACY_JWT_SECRET_HERE") {
			return c.json({
				success: false,
				error: "Test configuration not set. Please update via /v1/test/config/form"
			}, 400);
		}

		console.log("🧪 Test: Starting real document processing...");
		console.log("📋 Config:", {
			project_id: testConfig.project_id,
			document_id: testConfig.document_id,
			storage_path: testConfig.storage_path,
			bearer_token_length: testConfig.legacy_jwt_secret.length
		});

		// Create the request payload
		const processRequest = {
			project_id: testConfig.project_id,
			document_id: testConfig.document_id,
			storage_path: testConfig.storage_path
		};

		// Create a mock context that matches what the real API expects
		const mockContext = {
			req: {
				json: async () => processRequest,
				header: (name: string) => {
					if (name === "Authorization") {
						return `Bearer ${testConfig.legacy_jwt_secret}`;
					}
					return undefined;
				}
			},
			json: (data: unknown, status?: number) => {
				return {
					success: true,
					data,
					status: status || 200,
					headers: {},
					response: new Response(JSON.stringify(data), {
						status: status || 200,
						headers: { "Content-Type": "application/json" }
					})
				};
			}
		} as unknown as Context;

		console.log("🔄 Calling real processDocument function...");
		
		// Call the actual processDocument function
		const result = await processDocument(mockContext);
		
		console.log("✅ Document processing completed!");
		
		// Extract the actual response data
		let responseData;
		if (result && typeof result === 'object' && 'data' in result) {
			responseData = result.data;
		} else {
			responseData = result;
		}

		return c.json({
			success: true,
			message: "Real document processing completed!",
			test_mode: true,
			config_used: processRequest,
			processing_result: responseData,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error("❌ Document processing test failed:", error);
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			test_mode: true,
			config_used: {
				project_id: testConfig.project_id,
				document_id: testConfig.document_id,
				storage_path: testConfig.storage_path
			},
			timestamp: new Date().toISOString()
		}, 500);
	}
}

// Alternative test that makes an actual HTTP POST request
export async function testDocumentProcessHttp(c: Context) {
	try {
		if (testConfig.legacy_jwt_secret === "YOUR_LEGACY_JWT_SECRET_HERE") {
			return c.json({
				success: false,
				error: "Test configuration not set. Please update via /v1/test/config/form"
			}, 400);
		}

		console.log("🧪 Test: Starting HTTP POST document processing...");

		// Create the request payload
		const processRequest = {
			project_id: testConfig.project_id,
			document_id: testConfig.document_id,
			storage_path: testConfig.storage_path
		};

		// Get the API base URL (use localhost if we're in the same container network)
		const apiUrl = Deno.env.get("API_BASE_URL") || "http://localhost:8000";
		const endpoint = `${apiUrl}/v1/documents/process`;

		console.log("🔄 Making HTTP POST request to:", endpoint);
		console.log("📋 Request payload:", processRequest);

		// Make the actual HTTP POST request
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testConfig.legacy_jwt_secret}`
			},
			body: JSON.stringify(processRequest)
		});

		const responseData = await response.json();

		console.log("📡 HTTP Response status:", response.status);
		console.log("📄 Response data:", responseData);

		if (!response.ok) {
			return c.json({
				success: false,
				error: `HTTP ${response.status}: ${response.statusText}`,
				response_data: responseData,
				test_mode: "http_post",
				config_used: processRequest,
				endpoint_used: endpoint,
				timestamp: new Date().toISOString()
			}, 500);
		}

		return c.json({
			success: true,
			message: "HTTP POST document processing completed!",
			http_status: response.status,
			test_mode: "http_post",
			config_used: processRequest,
			endpoint_used: endpoint,
			processing_result: responseData,
			timestamp: new Date().toISOString()
		});

	} catch (error) {
		console.error("❌ HTTP document processing test failed:", error);
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			test_mode: "http_post",
			config_used: {
				project_id: testConfig.project_id,
				document_id: testConfig.document_id,
				storage_path: testConfig.storage_path
			},
			timestamp: new Date().toISOString()
		}, 500);
	}
}

export async function testListDocuments(c: Context) {
	try {
		// This would require implementing a list documents endpoint
		return c.json({
			success: true,
			message: "Document listing not implemented yet",
			suggestion: "Implement GET /v1/documents endpoint to list user documents",
			current_test_document: {
				document_id: testConfig.document_id,
				project_id: testConfig.project_id,
				storage_path: testConfig.storage_path
			}
		});
	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
}

// Vector search tests
export async function testVectorStats(c: Context) {
	try {
		const testConfig = getConfig();
		const info = await qdrantService.getCollectionInfo(testConfig.user_id, testConfig.project_id);
		const collectionName = `insightsphere_user_${testConfig.user_id}_project_${testConfig.project_id}`;
		return c.json({
			success: true,
			service: "Vector Storage",
			collection_name: collectionName,
			stats: info,
			last_config_update: testConfig.last_updated
		});
	} catch (error) {
		return c.json({
			success: false,
			service: "Vector Storage",
			error: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
}

export async function testVectorSearch(c: Context) {
	try {
		const query = c.req.query("query") || "test search";
		
		if (!query) {
			return c.json({
				success: false,
				error: "Query parameter required. Use ?query=your search term"
			}, 400);
		}

		// Generate embedding for the query
		const queryEmbedding = await openaiClient.generateEmbedding({
			text: query,
			model: "text-embedding-3-small"
		});

		// Search for similar vectors (using per-project collection)
		const searchResults = await qdrantService.searchSimilar(
			queryEmbedding.embedding,
			{
				userId: testConfig.user_id,
				projectId: testConfig.project_id !== "YOUR_PROJECT_ID" ? testConfig.project_id : undefined,
				useProjectCollection: true, // Use per-project collection
				limit: 5,
				threshold: 0.5
			}
		);

		return c.json({
			success: true,
			query,
			embedding_dimensions: queryEmbedding.embedding.length,
			tokens_used: queryEmbedding.usage.total_tokens,
			results_found: searchResults.length,
			results: searchResults,
			filter_used: {
				projectId: testConfig.project_id !== "YOUR_PROJECT_ID" ? testConfig.project_id : "none"
			}
		});

	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error"
		}, 500);
	}
}

/**
 * Test the new project-based search endpoint
 * GET /v1/test/search-project?query=your search term
 */
export async function testProjectSearch(c: Context) {
	try {
		const query = c.req.query("query");
		if (!query) {
			return c.json({
				success: false,
				error: "Query parameter required. Use ?query=your search term"
			}, 400);
		}

		const testConfig = getConfig();
		
		// Make HTTP request to the actual search endpoint
		const searchPayload = {
			query: query,
			project_id: testConfig.project_id,
			limit: 5,
			threshold: 0.6
		};

		console.log(`🧪 Testing project search with query: "${query}"`);
		console.log(`📋 Project ID: ${testConfig.project_id}`);

		const response = await fetch("http://localhost:8000/v1/search/query", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${testConfig.legacy_jwt_secret}`,
				"X-Admin-User-Id": testConfig.user_id, // For admin mode
			},
			body: JSON.stringify(searchPayload)
		});

		const result = await response.json();

		if (!response.ok) {
			throw new Error(`Search failed: ${result.error || response.statusText}`);
		}

		// Enhanced HTML response for browser testing
		const html = `
<!DOCTYPE html>
<html>
<head>
    <title>🔍 Project Search Test Results</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #703bf7, #9d5ef7); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .query { font-size: 1.2em; font-weight: bold; color: #703bf7; margin-bottom: 10px; }
        .metadata { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .result { border-left: 4px solid #703bf7; padding: 15px; margin: 15px 0; background: #fafafa; }
        .score { float: right; background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; }
        .page-info { color: #6c757d; font-size: 0.9em; margin-top: 8px; }
        .content { line-height: 1.6; margin: 10px 0; }
        .no-results { text-align: center; color: #6c757d; padding: 40px; }
        .success { color: #28a745; font-weight: bold; }
        .error { color: #dc3545; font-weight: bold; }
        .back-link { display: inline-block; margin: 20px 0; padding: 10px 15px; background: #703bf7; color: white; text-decoration: none; border-radius: 5px; }
        .collection-info { background: #e8f4fd; border-left: 4px solid #0066cc; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Project Search Test Results</h1>
            <p>Testing per-project vector search with RAG pipeline</p>
        </div>

        <a href="/v1/test/dashboard" class="back-link">← Back to Test Dashboard</a>

        <div class="card">
            <div class="query">Query: "${result.query}"</div>
            
            <div class="metadata">
                <strong>Search Metadata:</strong><br>
                <strong>Project ID:</strong> ${result.project_id}<br>
                <strong>Results Found:</strong> ${result.results.length}<br>
                <strong>Embedding Model:</strong> ${result.metadata.embedding_model}<br>
                <strong>Processing Time:</strong> ${result.metadata.processing_time_ms}ms<br>
                <strong>Collection Strategy:</strong> ${result.metadata.collection_strategy}<br>
                <strong>Threshold Used:</strong> ${result.metadata.threshold_used}
            </div>

            <div class="collection-info">
                <strong>🗂️ Collection Used:</strong> insightsphere_user_${testConfig.user_id}_project_${result.project_id}
                <br><em>This ensures only documents from this specific project are searched!</em>
            </div>

            <div class="results">
                ${result.results.length > 0 ? 
                    result.results.map((item: { score: number; metadata: { fileName: string; pageNumber?: number; chunkIndex: number; documentId: string }; content: string }, index: number) => `
                        <div class="result">
                            <div class="score">Score: ${(item.score * 100).toFixed(1)}%</div>
                            <strong>Result ${index + 1}:</strong> ${item.metadata.fileName}
                            <div class="page-info">
                                📄 Page ${item.metadata.pageNumber || 'N/A'} • 
                                Chunk ${item.metadata.chunkIndex} • 
                                Document: ${item.metadata.documentId.substring(0, 8)}...
                            </div>
                            <div class="content">${item.content.substring(0, 300)}${item.content.length > 300 ? '...' : ''}</div>
                        </div>
                    `).join('') 
                    : '<div class="no-results">No relevant results found. Try a different query or check if documents are processed.</div>'
                }
            </div>
        </div>

        <div class="card">
            <h3>🧪 Test Different Queries:</h3>
            <p><a href="/v1/test/search-project?query=machine learning">machine learning</a></p>
            <p><a href="/v1/test/search-project?query=neural networks">neural networks</a></p>
            <p><a href="/v1/test/search-project?query=key findings">key findings</a></p>
            <p><a href="/v1/test/search-project?query=methodology">methodology</a></p>
            <p><a href="/v1/test/search-project?query=results">results</a></p>
        </div>
    </div>
</body>
</html>`;

		return c.html(html);

	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
			details: "Make sure documents are processed and Qdrant is running"
		}, 500);
	}
}
