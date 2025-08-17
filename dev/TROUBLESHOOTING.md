# 🛠️ InsightSphere Troubleshooting Guide

## Common Issues & Solutions

### 1. 📄 PDF Parsing Returns 0 Characters

**Symptoms:**
- `Parsed document: 0 characters, X pages`
- Document has pages but no extracted text

**Possible Causes & Solutions:**

#### A. **Image-based PDF (Scanned Documents)**
If your PDF contains scanned images instead of text:
```bash
# Check if it's a scanned PDF by manually selecting text
# If you can't select text, it needs OCR
```

**Solution:** The PDF is likely image-based and needs OCR. You can:
1. Convert using online OCR tools first
2. Or add OCR support to the parser (future enhancement)

#### B. **PDF Protection/Encryption**
```bash
# Check Docker logs for specific errors
docker compose logs -f doc-parser
```

Look for errors like:
- "PDF is encrypted"
- "Permission denied"
- "Invalid PDF structure"

#### C. **Font/Encoding Issues**
Some PDFs use custom fonts or encodings that are hard to extract.

**Debug Steps:**
1. **Check parser logs:**
   ```bash
   docker compose logs -f doc-parser
   ```

2. **Look for per-page extraction:**
   ```
   📝 Page 1: extracted 0 characters
   📝 Page 2: extracted 0 characters
   ```

3. **Test with a simple PDF:**
   Try uploading a basic text PDF to confirm the parser works

#### D. **File Path Issues**
```bash
# Check if temp file was created properly
docker compose logs -f api | grep "temp"
```

### 2. 💰 OpenAI Quota Exceeded

**Error:** `429 You exceeded your current quota`

**Free Alternatives (Already Implemented):**

#### A. **Hugging Face (Recommended)**
1. **Get free API key:**
   - Go to https://huggingface.co/settings/tokens
   - Create a new token (free)

2. **Add to environment:**
   ```bash
   export HUGGINGFACE_API_KEY="hf_your_token_here"
   ```

3. **Benefits:**
   - Free tier: 1000 requests/day
   - Good quality embeddings
   - Model: `sentence-transformers/all-MiniLM-L6-v2`

#### B. **Hash Embeddings (Fallback)**
- Always available (no API needed)
- Deterministic and consistent
- Good for development/testing
- Not suitable for production

**The system automatically falls back:**
```
OpenAI → Hugging Face → Hash Embeddings
```

### 3. 🔧 Environment Setup

**Required Environment Variables:**

```bash
# Supabase (Required)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Admin Access (Required for testing)
LEGACY_JWT_SECRET=your_secret_admin_token

# Embeddings (Choose one)
OPENAI_API_KEY=your_openai_key                # Paid
HUGGINGFACE_API_KEY=your_hf_token             # Free
# (Hash embeddings need no key - always available)

# Storage
SUPABASE_STORAGE_BUCKET=your_bucket_name
```

### 4. 🚀 Complete Testing Workflow

#### Step 1: Start Services
```bash
cd dev/
./start.sh
```

Wait for all services to show ✅ status.

#### Step 2: Set Admin Token
```bash
export LEGACY_JWT_SECRET="my-super-secret-admin-key"
```

#### Step 3: Open Test Dashboard
```
http://localhost:8000/v1/test/dashboard
```

#### Step 4: Test System Health
Click all health tests first:
- ✅ API Health
- ✅ Qdrant Status  
- ✅ OpenAI/HuggingFace Connection

#### Step 5: Test Document Processing
1. **Process Document (HTTP)** - Full realistic test
2. **Check logs:**
   ```bash
   docker compose logs -f api
   docker compose logs -f doc-parser
   ```

#### Step 6: Verify Results
- **Vector Stats** - Should show chunks stored
- **Search Test** - Try searching for content

### 5. 📊 Expected Log Output

#### Successful PDF Processing:
```
📄 PDF parsing result:
  File: /tmp/insightsphere_xxx/document.pdf
  Pages: 12
  Text length: 15847 characters
  Text preview: This document contains important information...

📝 Page 1: extracted 1284 characters
📝 Page 2: extracted 1156 characters
...

Created 18 text chunks
🔄 Attempting OpenAI embeddings...
⚠️ OpenAI embeddings failed, switching to free alternative
🆓 Using free embedding service...
✅ Generated 18 free embeddings using sentence-transformers/all-MiniLM-L6-v2
```

#### Failed PDF Processing:
```
📄 PDF parsing result:
  Text length: 0 characters
⚠️ Warning: PDF parsing returned empty text

❌ Failed to extract text from page 1: <specific error>
```

### 6. 🆓 Free Development Setup

**Completely Free Stack:**

1. **Embeddings:** Hugging Face (free tier)
2. **Vector DB:** Qdrant (self-hosted)
3. **Database:** Supabase (free tier)
4. **Parser:** UniPDF (open source)

**No paid services required for development!**

### 7. 🔍 Advanced Debugging

#### Check PDF Structure:
```bash
# Enter doc-parser container
docker compose exec doc-parser sh

# Install PDF tools
apk add poppler-utils

# Analyze PDF
pdfinfo /path/to/your/file.pdf
pdffonts /path/to/your/file.pdf
```

#### Test Parser Directly:
```bash
curl -X POST http://localhost:8080/parse/pdf \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/tmp/your-file.pdf"}'
```

#### Check Qdrant Data:
```bash
# Open Qdrant dashboard
open http://localhost:6333/dashboard

# Or check via API
curl http://localhost:6333/collections/insightsphere-docs
```

### 8. 🚨 Emergency Fixes

#### Reset Everything:
```bash
docker compose down -v  # Remove all data
docker compose up -d    # Fresh start
```

#### Clear Qdrant Only:
```bash
curl -X DELETE http://localhost:6333/collections/insightsphere-docs
```

#### Check All Logs:
```bash
docker compose logs -f
```

---

## 📞 Still Need Help?

1. **Check logs** for specific error messages
2. **Try with a simple PDF** (text-based, not scanned)
3. **Verify environment variables** are set correctly
4. **Use free embeddings** for development
5. **Test each component** individually using the dashboard

The system is designed to be resilient with multiple fallbacks! 🎯
