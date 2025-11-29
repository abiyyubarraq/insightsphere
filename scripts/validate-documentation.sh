#!/bin/bash

# Documentation Validation Script
# Validates all documentation files after migration/updates
# Usage: ./scripts/validate-documentation.sh

set -e  # Exit on error

echo "========================================="
echo "Documentation Validation Script"
echo "========================================="
echo ""

ERRORS=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Test 1: Verify no "costants" typo remains
echo "Test 1: Checking for 'costants' typo..."
if grep -r "costants" --include="*.ts" --include="*.md" . 2>/dev/null | grep -v "validate-documentation.sh" | grep -v "node_modules"; then
    echo -e "${RED}✗ FAIL: Found 'costants' typo${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✓ PASS: No 'costants' typo found${NC}"
fi
echo ""

# Test 2: Verify no "Go 1.24" references
echo "Test 2: Checking for 'Go 1.24' references..."
if grep -r "Go 1\.24" --include="*.md" --include="*.mdc" . 2>/dev/null | grep -v "validate-documentation.sh"; then
    echo -e "${RED}✗ FAIL: Found 'Go 1.24' references${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✓ PASS: No 'Go 1.24' references found${NC}"
fi
echo ""

# Test 3: Verify date standardization (2025-11-29)
echo "Test 3: Checking date consistency..."
EXPECTED_DATE="2025-11-29"
OLD_DATES=$(grep -r "Last Updated.*202[45]-[01][0-9]-[0-3][0-9]" \
    --include="*.md" --include="*.mdc" \
    .claude context CLAUDE.md 2>/dev/null | \
    grep -v "$EXPECTED_DATE" | \
    grep -v "validate-documentation.sh" || true)

if [ -n "$OLD_DATES" ]; then
    echo -e "${YELLOW}⚠ WARNING: Found inconsistent dates:${NC}"
    echo "$OLD_DATES"
    ((WARNINGS++))
else
    echo -e "${GREEN}✓ PASS: All dates standardized to $EXPECTED_DATE${NC}"
fi
echo ""

# Test 4: Verify troubleshooting sections exist
echo "Test 4: Checking troubleshooting sections..."
MISSING_TROUBLESHOOTING=0

for file in \
    ".claude/context/deno-conventions.md" \
    ".claude/context/go-patterns.md" \
    ".claude/context/svelte5-patterns.md" \
    ".claude/context/architecture.md" \
    ".claude/context/multiservice.md"
do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ File not found: $file${NC}"
        ((ERRORS++))
        continue
    fi

    if ! grep -q "## 🚨 Troubleshooting Common Issues" "$file"; then
        echo -e "${RED}✗ FAIL: Missing troubleshooting section in $file${NC}"
        ((MISSING_TROUBLESHOOTING++))
    else
        echo -e "${GREEN}✓ Found troubleshooting in $file${NC}"
    fi
done

if [ $MISSING_TROUBLESHOOTING -gt 0 ]; then
    ((ERRORS++))
fi
echo ""

# Test 5: Verify Mermaid diagrams in architecture.md
echo "Test 5: Checking Mermaid diagrams..."
ARCH_FILE=".claude/context/architecture.md"

if [ ! -f "$ARCH_FILE" ]; then
    echo -e "${RED}✗ FAIL: $ARCH_FILE not found${NC}"
    ((ERRORS++))
else
    MERMAID_COUNT=$(grep -c "^```mermaid" "$ARCH_FILE" || true)
    if [ "$MERMAID_COUNT" -lt 4 ]; then
        echo -e "${RED}✗ FAIL: Expected 4 Mermaid diagrams, found $MERMAID_COUNT${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ PASS: Found $MERMAID_COUNT Mermaid diagrams${NC}"
    fi
fi
echo ""

# Test 6: Verify performance benchmarks in rag-pipeline.md
echo "Test 6: Checking performance benchmarks..."
RAG_FILE="context/rag-pipeline.md"

if [ ! -f "$RAG_FILE" ]; then
    echo -e "${RED}✗ FAIL: $RAG_FILE not found${NC}"
    ((ERRORS++))
else
    if ! grep -q "## 📊 Performance Benchmarks" "$RAG_FILE"; then
        echo -e "${RED}✗ FAIL: Missing performance benchmarks section${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ PASS: Found performance benchmarks section${NC}"
    fi
fi
echo ""

# Test 7: Verify error code reference in architecture.md
echo "Test 7: Checking error code reference..."
if [ ! -f "$ARCH_FILE" ]; then
    echo -e "${RED}✗ FAIL: $ARCH_FILE not found${NC}"
    ((ERRORS++))
else
    if ! grep -q "## 🔢 Error Code Reference" "$ARCH_FILE"; then
        echo -e "${RED}✗ FAIL: Missing error code reference section${NC}"
        ((ERRORS++))
    else
        # Count error code categories
        ERROR_CATEGORIES=$(grep -c "^### PROC\|^### EMB\|^### VDB\|^### RAG\|^### AUTH\|^### STOR\|^### DB\|^### SYS" "$ARCH_FILE" || true)
        if [ "$ERROR_CATEGORIES" -lt 8 ]; then
            echo -e "${YELLOW}⚠ WARNING: Expected 8 error categories, found $ERROR_CATEGORIES${NC}"
            ((WARNINGS++))
        else
            echo -e "${GREEN}✓ PASS: Found error code reference with $ERROR_CATEGORIES categories${NC}"
        fi
    fi
fi
echo ""

# Test 8: Verify migration guides in embedding-strategy.md
echo "Test 8: Checking migration guides..."
EMB_FILE="context/embedding-strategy.md"

if [ ! -f "$EMB_FILE" ]; then
    echo -e "${RED}✗ FAIL: $EMB_FILE not found${NC}"
    ((ERRORS++))
else
    if ! grep -q "## 🔄 Migration Guides" "$EMB_FILE"; then
        echo -e "${RED}✗ FAIL: Missing migration guides section${NC}"
        ((ERRORS++))
    else
        MIGRATION_COUNT=$(grep -c "^### Migration [0-9]" "$EMB_FILE" || true)
        if [ "$MIGRATION_COUNT" -lt 4 ]; then
            echo -e "${YELLOW}⚠ WARNING: Expected 4 migration guides, found $MIGRATION_COUNT${NC}"
            ((WARNINGS++))
        else
            echo -e "${GREEN}✓ PASS: Found $MIGRATION_COUNT migration guides${NC}"
        fi
    fi
fi
echo ""

# Test 9: Verify file exists and readable
echo "Test 9: Checking critical files exist..."
CRITICAL_FILES=(
    "CLAUDE.md"
    ".claude/context/architecture.md"
    ".claude/context/deno-conventions.md"
    ".claude/context/go-patterns.md"
    ".claude/context/svelte5-patterns.md"
    ".claude/context/design-principles.md"
    ".claude/context/multiservice.md"
    ".claude/context/overview.md"
    ".claude/context/supabase.md"
    "context/rag-pipeline.md"
    "context/embedding-strategy.md"
    "context/qdrant.md"
    "api/lib/constants.ts"
    "api/lib/embeddingClient.ts"
)

MISSING_FILES=0
for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ Missing: $file${NC}"
        ((MISSING_FILES++))
    fi
done

if [ $MISSING_FILES -gt 0 ]; then
    echo -e "${RED}✗ FAIL: $MISSING_FILES critical files missing${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✓ PASS: All critical files present${NC}"
fi
echo ""

# Test 10: Check for broken markdown links
echo "Test 10: Checking for broken internal links..."
BROKEN_LINKS=0

# Simple check for common broken link patterns
if grep -r "\[.*\](.*/costants\.ts)" --include="*.md" . 2>/dev/null | grep -v "validate-documentation.sh"; then
    echo -e "${RED}✗ Found broken links to costants.ts${NC}"
    ((BROKEN_LINKS++))
fi

if [ $BROKEN_LINKS -gt 0 ]; then
    echo -e "${RED}✗ FAIL: Found $BROKEN_LINKS broken links${NC}"
    ((ERRORS++))
else
    echo -e "${GREEN}✓ PASS: No obvious broken links found${NC}"
fi
echo ""

# Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo "Documentation is valid and ready."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warnings${NC}"
    echo "Documentation is mostly valid with minor issues."
    exit 0
else
    echo -e "${RED}✗ $ERRORS errors, $WARNINGS warnings${NC}"
    echo "Please fix errors before proceeding."
    exit 1
fi
