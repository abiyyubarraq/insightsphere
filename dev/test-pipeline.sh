#!/bin/bash

# InsightSphere Document Processing Pipeline Test Script
# Simple bash version for quick testing

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE VALUES
API_URL="http://localhost:8000"
BEARER_TOKEN="YOUR_SUPABASE_JWT_TOKEN_HERE"
PROJECT_ID="YOUR_PROJECT_ID"
DOCUMENT_ID="YOUR_DOCUMENT_ID"
STORAGE_PATH="path/to/your/file.pdf"

echo -e "${BLUE}🧪 InsightSphere Document Processing Pipeline Test${NC}"
echo "============================================================"

# Function to check if required tools are available
check_requirements() {
    echo -e "${BLUE}🔧 Checking requirements...${NC}"
    
    if ! command -v curl &> /dev/null; then
        echo -e "${RED}❌ curl is required but not installed${NC}"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo -e "${YELLOW}⚠️  jq is not installed (optional, but recommended for pretty JSON)${NC}"
        JQ_AVAILABLE=false
    else
        JQ_AVAILABLE=true
    fi
    
    echo -e "${GREEN}✅ Requirements check passed${NC}"
}

# Function to validate configuration
validate_config() {
    echo -e "${BLUE}🔧 Validating configuration...${NC}"
    
    if [ "$BEARER_TOKEN" = "YOUR_SUPABASE_JWT_TOKEN_HERE" ]; then
        echo -e "${RED}❌ BEARER_TOKEN not configured${NC}"
        echo "Please update the BEARER_TOKEN variable at the top of this script"
        exit 1
    fi
    
    if [ "$PROJECT_ID" = "YOUR_PROJECT_ID" ]; then
        echo -e "${RED}❌ PROJECT_ID not configured${NC}"
        echo "Please update the PROJECT_ID variable at the top of this script"
        exit 1
    fi
    
    if [ "$DOCUMENT_ID" = "YOUR_DOCUMENT_ID" ]; then
        echo -e "${RED}❌ DOCUMENT_ID not configured${NC}"
        echo "Please update the DOCUMENT_ID variable at the top of this script"
        exit 1
    fi
    
    if [ "$STORAGE_PATH" = "path/to/your/file.pdf" ]; then
        echo -e "${RED}❌ STORAGE_PATH not configured${NC}"
        echo "Please update the STORAGE_PATH variable at the top of this script"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Configuration looks good${NC}"
}

# Function to test API health
test_api_health() {
    echo -e "${BLUE}🩺 Step 1: Testing API Health...${NC}"
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -H "Content-Type: application/json" \
        "$API_URL/health")
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ API is healthy!${NC}"
        if [ "$JQ_AVAILABLE" = true ]; then
            echo "$body" | jq .
        else
            echo "$body"
        fi
    else
        echo -e "${RED}❌ API health check failed (HTTP $http_code)${NC}"
        echo "$body"
        exit 1
    fi
}

# Function to test document processing
test_document_processing() {
    echo -e "${BLUE}🔄 Step 2: Testing Document Processing...${NC}"
    
    payload=$(cat <<EOF
{
    "project_id": "$PROJECT_ID",
    "document_id": "$DOCUMENT_ID",
    "storage_path": "$STORAGE_PATH"
}
EOF
)
    
    echo "Request payload:"
    if [ "$JQ_AVAILABLE" = true ]; then
        echo "$payload" | jq .
    else
        echo "$payload"
    fi
    
    echo "Sending request..."
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $BEARER_TOKEN" \
        -d "$payload" \
        "$API_URL/v1/documents/process")
    
    http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    body=$(echo $response | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Document processing completed successfully!${NC}"
        if [ "$JQ_AVAILABLE" = true ]; then
            echo "$body" | jq .
        else
            echo "$body"
        fi
    else
        echo -e "${RED}❌ Document processing failed (HTTP $http_code)${NC}"
        if [ "$JQ_AVAILABLE" = true ]; then
            echo "$body" | jq .
        else
            echo "$body"
        fi
        exit 1
    fi
}

# Function to check Qdrant
check_qdrant() {
    echo -e "${BLUE}🔍 Step 3: Checking Qdrant...${NC}"
    
    qdrant_response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        "http://localhost:6333/collections/insightsphere-docs")
    
    qdrant_http_code=$(echo $qdrant_response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    qdrant_body=$(echo $qdrant_response | sed -e 's/HTTPSTATUS\:.*//g')
    
    if [ "$qdrant_http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ Qdrant collection exists!${NC}"
        if [ "$JQ_AVAILABLE" = true ]; then
            echo "$qdrant_body" | jq '.result.points_count'
        else
            echo "Points count: $(echo "$qdrant_body" | grep -o '"points_count":[0-9]*' | cut -d':' -f2)"
        fi
    else
        echo -e "${YELLOW}⚠️  Could not access Qdrant collection (HTTP $qdrant_http_code)${NC}"
        echo "This might be normal if the collection hasn't been created yet"
    fi
}

# Function to show next steps
show_next_steps() {
    echo ""
    echo -e "${GREEN}🎉 Test completed!${NC}"
    echo ""
    echo -e "${BLUE}📋 Next steps:${NC}"
    echo "   1. Check Qdrant dashboard: http://localhost:6333/dashboard"
    echo "   2. Verify chunks in collection: insightsphere-docs"
    echo "   3. Check document status in Supabase project_files table"
    echo "   4. Try vector search functionality"
    echo ""
    echo -e "${BLUE}🔍 Manual verification commands:${NC}"
    echo "   # Check Qdrant collection info"
    echo "   curl http://localhost:6333/collections/insightsphere-docs"
    echo ""
    echo "   # List all collections"
    echo "   curl http://localhost:6333/collections"
}

# Main execution
main() {
    check_requirements
    validate_config
    test_api_health
    test_document_processing
    check_qdrant
    show_next_steps
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
