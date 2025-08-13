#!/bin/bash

# Pickle Play Dates - Deploy and Test Script
# This script handles deployment and integration testing

set -e # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

echo "🚀 Pickle Play Dates - Deployment & Integration Testing"
echo "======================================================="

# Step 1: Check prerequisites
print_status "Checking prerequisites..."

# Check AWS CLI
if ! command -v aws >/dev/null 2>&1; then
    print_error "AWS CLI not found. Please install AWS CLI first."
    exit 1
fi
print_success "AWS CLI found: $(aws --version)"

# Check AWS credentials
print_status "Checking AWS credentials..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    print_error "AWS credentials not configured."
    echo ""
    echo "Please configure AWS credentials using one of these methods:"
    echo "1. aws configure"
    echo "2. export AWS_ACCESS_KEY_ID=... && export AWS_SECRET_ACCESS_KEY=..."
    echo "3. AWS profile: export AWS_PROFILE=your-profile"
    echo ""
    echo "See DEPLOYMENT.md for detailed instructions."
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "us-west-2")
print_success "AWS credentials configured - Account: $ACCOUNT_ID, Region: $REGION"

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    print_error "Node.js not found. Please install Node.js 18+ first."
    exit 1
fi
print_success "Node.js found: $(node --version)"

# Step 2: Build application
print_status "Building application..."
if [[ -f "./build-and-test.sh" ]]; then
    ./build-and-test.sh
else
    npm install
    npm run build
fi
print_success "Application built successfully"

# Step 3: Check if CDK is bootstrapped
print_status "Checking CDK bootstrap status..."
cd infra

if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region $REGION >/dev/null 2>&1; then
    print_warning "CDK not bootstrapped in this account/region"
    print_status "Bootstrapping CDK..."
    npm run bootstrap
    print_success "CDK bootstrapped successfully"
else
    print_success "CDK already bootstrapped"
fi

# Step 4: Deploy to development
print_status "Deploying to development environment..."
echo "This will take 5-10 minutes..."

# Run deployment and capture outputs
DEPLOY_OUTPUT=$(npm run deploy:dev 2>&1 | tee /dev/tty)
DEPLOY_STATUS=$?

if [ $DEPLOY_STATUS -ne 0 ]; then
    print_error "Deployment failed!"
    echo "Check the error messages above and see DEPLOYMENT.md for troubleshooting."
    exit 1
fi

print_success "Deployment completed successfully!"

# Step 5: Extract deployment outputs
print_status "Extracting deployment outputs..."

# Try to get stack outputs
STACK_NAME="PicklePlayDatesStack-dev"
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION >/dev/null 2>&1; then
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    USER_POOL_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
        --output text 2>/dev/null || echo "")
    
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontUrl`].OutputValue' \
        --output text 2>/dev/null || echo "")
fi

# Display deployment information
echo ""
print_success "Deployment Information:"
echo "=================================="
echo "API Gateway URL: ${API_URL:-'Check AWS Console'}"
echo "User Pool ID: ${USER_POOL_ID:-'Check AWS Console'}"
echo "User Pool Client ID: ${USER_POOL_CLIENT_ID:-'Check AWS Console'}"
echo "CloudFront URL: ${CLOUDFRONT_URL:-'Check AWS Console'}"
echo "AWS Region: $REGION"
echo "AWS Account: $ACCOUNT_ID"
echo ""

# Step 6: Test API health
if [[ -n "$API_URL" ]]; then
    print_status "Testing API health..."
    if curl -s -f "$API_URL/health" >/dev/null; then
        print_success "API is responding"
    else
        print_warning "API health check failed (this might be normal if health endpoint not implemented)"
    fi
fi

# Step 7: Set up integration tests
print_status "Setting up integration tests..."
cd ../integration-tests

if [[ ! -f ".env" ]]; then
    cp .env.example .env
    print_success "Created integration test .env file"
else
    print_success "Integration test .env file already exists"
fi

# Update .env file with deployment outputs
if [[ -n "$API_URL" ]]; then
    if command -v sed >/dev/null 2>&1; then
        sed -i.bak "s|TEST_API_URL=.*|TEST_API_URL=$API_URL|" .env
        print_success "Updated TEST_API_URL in .env"
    fi
fi

echo ""
print_warning "MANUAL STEP REQUIRED:"
echo "======================================"
echo "Before running integration tests, you need to:"
echo ""
echo "1. Create a test user in Cognito:"
echo "   - Go to AWS Cognito Console"
echo "   - Find User Pool: $USER_POOL_ID"
echo "   - Create a test user"
echo ""
echo "2. Get a JWT token using one of these methods:"
echo ""
echo "   Method A - AWS CLI:"
echo "   aws cognito-idp admin-initiate-auth \\"
echo "     --user-pool-id $USER_POOL_ID \\"
echo "     --client-id $USER_POOL_CLIENT_ID \\"
echo "     --auth-flow ADMIN_NO_SRP_AUTH \\"
echo "     --auth-parameters USERNAME=testuser@example.com,PASSWORD=YourPassword123!"
echo ""
echo "   Method B - Use the web app:"
echo "   - Visit: $CLOUDFRONT_URL"
echo "   - Sign up/Sign in"
echo "   - Extract JWT from browser dev tools"
echo ""
echo "3. Update integration-tests/.env with your JWT token:"
echo "   TEST_AUTH_TOKEN=your-jwt-token-here"
echo ""
echo "4. Run integration tests:"
echo "   cd integration-tests && npm test"
echo ""

# Step 8: Offer to run integration tests
echo ""
read -p "Do you want to run integration tests now? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ -f ".env" ]] && grep -q "TEST_AUTH_TOKEN=" .env && ! grep -q "TEST_AUTH_TOKEN=$" .env && ! grep -q "TEST_AUTH_TOKEN=your-" .env; then
        print_status "Running integration tests..."
        npm install
        npm test
        print_success "Integration tests completed!"
    else
        print_error "Please configure TEST_AUTH_TOKEN in integration-tests/.env first"
        echo "See the instructions above for getting a JWT token."
    fi
else
    print_status "Skipping integration tests."
    echo "You can run them later with: cd integration-tests && npm test"
fi

echo ""
print_success "Deployment and setup completed!"
echo ""
echo "🎯 Next Steps:"
echo "=============="
echo "1. Configure authentication and run integration tests"
echo "2. Generate iOS SDK: swagger-codegen generate -i openapi.yaml -l swift5 -o ios-sdk/"
echo "3. Start iOS development with the deployed API"
echo "4. Deploy web app to CloudFront: cd web && npm run build"
echo ""
echo "📋 Useful Commands:"
echo "==================="
echo "• View logs: aws logs tail /aws/lambda/pickle-play-dates-create-game-dev --follow"
echo "• Redeploy: cd infra && npm run deploy:dev"
echo "• Destroy: cd infra && npm run destroy:dev"
echo "• Integration tests: cd integration-tests && npm test"
echo ""
echo "🚀 Your Pickle Play Dates API is ready for iOS development!"