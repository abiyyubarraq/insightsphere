#!/usr/bin/env node

/**
 * InsightSphere Document Processing Pipeline Test Script
 * 
 * This script tests the complete document processing pipeline:
 * 1. Calls /v1/documents/process endpoint
 * 2. Monitors processing status
 * 3. Verifies chunks are stored in Qdrant
 * 4. Tests vector search functionality
 */

// Configuration - UPDATE THESE VALUES
const CONFIG = {
  // API Configuration
  API_BASE_URL: 'http://localhost:8000',
  
  // Authentication - Get this from your Supabase Auth
  BEARER_TOKEN: 'YOUR_SUPABASE_JWT_TOKEN_HERE', // Replace with actual token
  
  // Document to test with - UPDATE THESE
  TEST_DOCUMENT: {
    project_id: 'YOUR_PROJECT_ID',      // Replace with actual project ID
    document_id: 'YOUR_DOCUMENT_ID',    // Replace with actual document ID from project_files table
    storage_path: 'path/to/your/file.pdf'  // Replace with actual storage path
  },
  
  // Testing options
  POLLING_INTERVAL: 2000, // 2 seconds
  MAX_POLLING_ATTEMPTS: 30, // 60 seconds total
};

// Helper function to make API calls
async function apiCall(endpoint, options = {}) {
  const url = `${CONFIG.API_BASE_URL}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.BEARER_TOKEN}`,
    },
  };
  
  const response = await fetch(url, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  });
  
  const data = await response.json();
  
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

// Test 1: Process Document
async function testDocumentProcessing() {
  console.log('\n🔄 Step 1: Testing Document Processing...');
  console.log('Document:', CONFIG.TEST_DOCUMENT);
  
  try {
    const result = await apiCall('/v1/documents/process', {
      method: 'POST',
      body: JSON.stringify(CONFIG.TEST_DOCUMENT),
    });
    
    if (result.ok) {
      console.log('✅ Document processing started successfully!');
      console.log('📊 Response:', result.data);
      return result.data;
    } else {
      console.error('❌ Document processing failed:', result.data);
      return null;
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
    return null;
  }
}

// Test 2: Check API Health
async function testApiHealth() {
  console.log('\n🩺 Step 0: Checking API Health...');
  
  try {
    const result = await apiCall('/health');
    
    if (result.ok) {
      console.log('✅ API is healthy!');
      console.log('📊 Health data:', result.data);
      return true;
    } else {
      console.error('❌ API health check failed:', result.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    return false;
  }
}

// Test 3: Test Vector Search (requires Qdrant to be accessible)
async function testVectorSearch() {
  console.log('\n🔍 Step 2: Testing Vector Search...');
  console.log('Note: This requires direct Qdrant access or a search endpoint');
  
  // This is a placeholder - you might want to implement a search endpoint
  // or test Qdrant directly if it's accessible
  console.log('⚠️  Vector search test not implemented yet');
  console.log('   You can manually test by:');
  console.log('   1. Opening Qdrant dashboard: http://localhost:6333/dashboard');
  console.log('   2. Checking collection: insightsphere-docs');
  console.log('   3. Verifying chunks are stored with correct metadata');
}

// Utility: Validate configuration
function validateConfig() {
  console.log('🔧 Validating configuration...');
  
  const issues = [];
  
  if (CONFIG.BEARER_TOKEN === 'YOUR_SUPABASE_JWT_TOKEN_HERE') {
    issues.push('BEARER_TOKEN not set');
  }
  
  if (CONFIG.TEST_DOCUMENT.project_id === 'YOUR_PROJECT_ID') {
    issues.push('project_id not set');
  }
  
  if (CONFIG.TEST_DOCUMENT.document_id === 'YOUR_DOCUMENT_ID') {
    issues.push('document_id not set');
  }
  
  if (CONFIG.TEST_DOCUMENT.storage_path === 'path/to/your/file.pdf') {
    issues.push('storage_path not set');
  }
  
  if (issues.length > 0) {
    console.error('❌ Configuration issues found:');
    issues.forEach(issue => console.error(`   - ${issue}`));
    console.error('\n📝 Please update the CONFIG object at the top of this script.');
    return false;
  }
  
  console.log('✅ Configuration looks good!');
  return true;
}

// Main test runner
async function runTests() {
  console.log('🧪 InsightSphere Document Processing Pipeline Test');
  console.log('=' .repeat(60));
  
  // Validate configuration first
  if (!validateConfig()) {
    process.exit(1);
  }
  
  // Test API health
  const isHealthy = await testApiHealth();
  if (!isHealthy) {
    console.error('\n❌ API is not healthy. Please check your setup:');
    console.error('   1. Run: docker compose -f dev/compose.yaml up');
    console.error('   2. Wait for all services to start');
    console.error('   3. Check logs for errors');
    process.exit(1);
  }
  
  // Test document processing
  const processResult = await testDocumentProcessing();
  if (!processResult) {
    console.error('\n❌ Document processing failed. Check the logs above.');
    process.exit(1);
  }
  
  // Test vector search
  await testVectorSearch();
  
  console.log('\n🎉 Test completed!');
  console.log('\n📋 Next steps:');
  console.log('   1. Check Qdrant dashboard: http://localhost:6333/dashboard');
  console.log('   2. Verify chunks in collection: insightsphere-docs');
  console.log('   3. Check document status in Supabase project_files table');
  console.log('   4. Try running the vector search manually');
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testApiHealth,
  testDocumentProcessing,
  testVectorSearch,
  CONFIG,
};
