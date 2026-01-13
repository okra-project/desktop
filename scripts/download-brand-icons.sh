#!/bin/bash
# Download brand icons from n8n repo (proven to work) and Simple Icons CDN
# Usage: ./scripts/download-brand-icons.sh

set -e
ICONS_DIR="assets/brand-icons"
mkdir -p "$ICONS_DIR"

echo "Downloading brand icons to $ICONS_DIR..."

# ============================================
# Icons from n8n repo (more reliable)
# ============================================
echo "Fetching from n8n repo..."

# AI/ML Providers
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/OpenAi/openAi.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/openai.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/OpenAi/openAi.dark.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/openai.dark.svg"
gh api "repos/n8n-io/n8n/contents/packages/@n8n/nodes-langchain/nodes/llms/LMChatAnthropic/anthropic.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/anthropic.svg"
gh api "repos/n8n-io/n8n/contents/packages/@n8n/nodes-langchain/nodes/vendors/GoogleGemini/gemini.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/gemini.svg"
gh api "repos/n8n-io/n8n/contents/packages/@n8n/nodes-langchain/nodes/llms/LmChatGroq/groq.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/groq.svg"
gh api "repos/n8n-io/n8n/contents/packages/@n8n/nodes-langchain/nodes/llms/LmChatMistralCloud/mistral.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/mistral.svg"

# Google Services
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Google/Gmail/gmail.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/gmail.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Google/Drive/googleDrive.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/googledrive.svg"

# AWS
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Aws/S3/s3.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/aws-s3.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Aws/lambda.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/aws-lambda.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Aws/Textract/textract.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/aws-textract.svg"

# Communication & Productivity
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Slack/slack.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/slack.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Discord/discord.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/discord.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Notion/notion.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/notion.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/Airtable/airtable.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/airtable.svg"
gh api "repos/n8n-io/n8n/contents/packages/nodes-base/nodes/GitHub/github.svg" -H "Accept: application/vnd.github.raw" > "$ICONS_DIR/github.svg"

echo "Fetched $(ls -1 $ICONS_DIR/*.svg 2>/dev/null | wc -l | tr -d ' ') icons from n8n"

# ============================================
# Icons from Simple Icons CDN (fallback)
# ============================================
echo "Fetching from Simple Icons CDN..."
BASE_URL="https://cdn.simpleicons.org"

SIMPLE_ICONS=(
  "google"
  "googlecloud"
  "dropbox"
  "box"
  "icloud"
  "googledocs"
  "googlesheets"
  "evernote"
  "gitlab"
  "docker"
  "python"
  "postgresql"
  "mongodb"
  "elasticsearch"
  "ollama"
  "huggingface"
)

for slug in "${SIMPLE_ICONS[@]}"; do
  echo "  $slug"
  curl -sL "$BASE_URL/$slug" -o "$ICONS_DIR/$slug.svg"
  curl -sL "$BASE_URL/$slug/white" -o "$ICONS_DIR/$slug.dark.svg"
done

# Remove any empty files (failed downloads)
find "$ICONS_DIR" -type f -size 0 -delete

echo ""
echo "Done! Total icons: $(ls -1 $ICONS_DIR/*.svg 2>/dev/null | wc -l | tr -d ' ')"
echo "Location: $ICONS_DIR/"
