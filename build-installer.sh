#!/bin/bash

# OkraPDF Desktop - Build Installer Script
# This script builds a distributable installer with the pre-configured API key

set -e  # Exit on any error

echo "================================================"
echo "OkraPDF Desktop - Installer Build Script"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the okrapdf-desktop directory.${NC}"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js 18+ is required. Current version: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version check passed${NC}"
echo ""

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf dist/
rm -rf release/build/
rm -rf .erb/dll/
echo -e "${GREEN}✓ Cleaned previous builds${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --ignore-scripts
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Build DLL for development
echo "Building development DLL..."
npm run build:dll
echo -e "${GREEN}✓ DLL built successfully${NC}"
echo ""

# Build production version
echo "Building production version..."
npm run build
echo -e "${GREEN}✓ Production build complete${NC}"
echo ""

# Package the application
echo "Creating installer..."
npm run package
echo -e "${GREEN}✓ Installer created successfully${NC}"
echo ""

# Show results
echo "================================================"
echo -e "${GREEN}BUILD COMPLETE!${NC}"
echo "================================================"
echo ""
echo "Installers created in: release/build/"
echo ""

# List created installers
if [ -d "release/build" ]; then
    echo "Created files:"
    ls -lh release/build/ | grep -v "^total" | grep -v "^d"
    echo ""
fi

echo -e "${YELLOW}Note: The API key is pre-configured in the installer.${NC}"
echo -e "${YELLOW}Users will not need their own Anthropic API key.${NC}"
echo ""
echo "Next steps:"
echo "1. Test the installer on a clean machine"
echo "2. Distribute to your users"
echo "3. Provide support@okrapdf.com for support"
echo ""
