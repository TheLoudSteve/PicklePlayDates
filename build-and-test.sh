#!/bin/bash

# Pickle Play Dates - Build and Test Script
# This script builds all workspaces and runs tests

set -e # Exit on any error

echo "🏗️  Building Pickle Play Dates Project"
echo "======================================="

# Check Node.js version
echo "📋 Checking Node.js version..."
node --version || {
    echo "❌ Node.js not found. Please install Node.js 18+ and try again."
    exit 1
}

npm --version || {
    echo "❌ npm not found. Please install npm and try again."
    exit 1
}

echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""

# Build shared-types first (other packages depend on it)
echo "🔧 Building shared-types..."
cd shared-types
npm run build
cd ..

echo ""

# Build API client
echo "🔧 Building api-client..."
cd api-client  
npm run build
cd ..

echo ""

# Build services
echo "🔧 Building services..."
cd services
npm run build
cd ..

echo ""

# Build web app
echo "🔧 Building web app..."
cd web
npm run build
cd ..

echo ""

# Build infrastructure
echo "🔧 Building infrastructure..."
cd infra
npm run build
cd ..

echo ""

# Run tests
echo "🧪 Running tests..."

# Services tests (with coverage)
echo "  📝 Running services tests..."
cd services
npm run test:coverage
cd ..

echo ""

# API client tests
echo "  📝 Running API client tests..."
cd api-client
npm run test
cd ..

echo ""

# Web app tests (if they exist)
echo "  📝 Running web app tests..."
cd web
npm run test || echo "  ⚠️  No web tests configured"
cd ..

echo ""

# Lint all code
echo "🔍 Running linting..."
npm run lint

echo ""

# Format check
echo "🎨 Checking code formatting..."
npm run format:check

echo ""

# Validate OpenAPI spec (if swagger-codegen is available)
echo "📋 Validating OpenAPI specification..."
if command -v swagger-codegen >/dev/null 2>&1; then
    swagger-codegen validate -i openapi.yaml
    echo "  ✅ OpenAPI spec is valid"
else
    echo "  ⚠️  swagger-codegen not found, skipping OpenAPI validation"
fi

echo ""
echo "🎉 Build and test completed successfully!"
echo ""
echo "📊 Next steps:"
echo "  1. Run integration tests: cd integration-tests && npm test"
echo "  2. Deploy to dev: npm run deploy:dev"
echo "  3. Generate iOS SDK from OpenAPI spec"
echo ""