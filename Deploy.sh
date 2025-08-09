#!/bin/bash

# Deploy script for Pickle Play Dates
# This script builds and deploys the entire application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_status "Checking prerequisites..."
if ! command_exists aws; then
    print_error "AWS CLI is not installed. Please install it first."
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed. Please install Node.js and npm first."
    exit 1
fi

print_success "Prerequisites check passed"

# Build lambda services
print_status "Building Lambda services..."
cd services || { print_error "Failed to change to services directory"; exit 1; }

if npm install; then
    print_success "Lambda services npm install completed"
else
    print_error "Lambda services npm install failed"
    exit 1
fi

if npm run build; then
    print_success "Lambda services build completed"
else
    print_error "Lambda services build failed"
    exit 1
fi

# Build web application
print_status "Building web application..."
cd ../web || { print_error "Failed to change to web directory"; exit 1; }

if npm install; then
    print_success "Web application npm install completed"
else
    print_error "Web application npm install failed"
    exit 1
fi

if npm run build; then
    print_success "Web application build completed"
else
    print_error "Web application build failed"
    exit 1
fi

# Deploy infrastructure
print_status "Deploying infrastructure..."
cd ../infra || { print_error "Failed to change to infra directory"; exit 1; }

if npm install; then
    print_success "Infrastructure npm install completed"
else
    print_error "Infrastructure npm install failed"
    exit 1
fi

print_status "Running CDK deploy (this may take several minutes)..."
if npm run deploy:dev; then
    print_success "Infrastructure deployment completed"
else
    print_error "Infrastructure deployment failed"
    exit 1
fi

# Get stack outputs
print_status "Retrieving deployment information..."
STACK_NAME="PicklePlayDates-dev"

# Get S3 bucket name from stack outputs
S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
    --output text 2>/dev/null)

# Get CloudFront distribution ID from stack outputs
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
    --output text 2>/dev/null)

if [ -z "$S3_BUCKET" ] || [ "$S3_BUCKET" = "None" ]; then
    print_error "Could not retrieve S3 bucket name from CloudFormation stack"
    exit 1
fi

print_success "Found S3 bucket: $S3_BUCKET"

if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    print_success "Found CloudFront distribution: $DISTRIBUTION_ID"
else
    print_warning "CloudFront distribution ID not found in stack outputs"
fi

# Deploy website to S3
print_status "Deploying website to S3..."
cd ../web || { print_error "Failed to change to web directory"; exit 1; }

if aws s3 sync out "s3://$S3_BUCKET" --delete; then
    print_success "Website deployed to S3 successfully"
else
    print_error "Failed to deploy website to S3"
    exit 1
fi

# Invalidate CloudFront cache
if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    print_status "Invalidating CloudFront cache..."
    
    INVALIDATION_OUTPUT=$(aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --output json 2>&1)
    
    if [ $? -eq 0 ]; then
        INVALIDATION_ID=$(echo "$INVALIDATION_OUTPUT" | grep -o '"Id": "[^"]*"' | cut -d'"' -f4)
        print_success "CloudFront cache invalidation started"
        print_status "Invalidation ID: $INVALIDATION_ID"
        print_status "Distribution ID: $DISTRIBUTION_ID"
        print_status "Note: Cache invalidation may take 10-15 minutes to complete"
    else
        print_error "Failed to create CloudFront invalidation"
        print_error "$INVALIDATION_OUTPUT"
    fi
else
    print_warning "Skipping CloudFront cache invalidation (distribution ID not available)"
    print_warning "You may need to manually invalidate the cache if you have CloudFront configured"
fi

# Final status
print_success "Deployment completed successfully!"
print_status "Summary:"
echo "  • Lambda services: Built and deployed"
echo "  • Web application: Built and deployed"
echo "  • Infrastructure: Deployed via CDK"
echo "  • S3 bucket: $S3_BUCKET"
if [ -n "$DISTRIBUTION_ID" ] && [ "$DISTRIBUTION_ID" != "None" ]; then
    echo "  • CloudFront: Cache invalidation started"
    
    # Get CloudFront URL
    CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" \
        --output text 2>/dev/null)
    
    if [ -n "$CLOUDFRONT_URL" ] && [ "$CLOUDFRONT_URL" != "None" ]; then
        echo "  • Application URL: $CLOUDFRONT_URL"
    fi
fi

print_success "Your application is ready!"