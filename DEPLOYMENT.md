# Deployment Guide - Pickle Play Dates

This guide walks you through deploying the Pickle Play Dates application to AWS and running integration tests.

## Prerequisites

### 1. AWS Account Setup
- AWS Account with appropriate permissions
- AWS CLI installed ✅ (Version 2.28.8 detected)
- CDK CLI installed ✅ (Already configured in infra/)

### 2. Required AWS Permissions
Your AWS user/role needs these permissions:
- CloudFormation (full access)
- Lambda (full access)
- DynamoDB (full access)
- API Gateway (full access)
- Cognito (full access)
- S3 (full access)
- CloudFront (full access)
- SES (full access)
- SNS (full access)
- IAM (limited - for creating service roles)

## Step 1: Configure AWS Credentials

Choose one of these methods:

### Option A: AWS Configure (Recommended)
```bash
aws configure
```
Enter:
- AWS Access Key ID: `[Your Access Key]`
- AWS Secret Access Key: `[Your Secret Key]`
- Default region: `us-west-2` (or your preferred region)
- Default output format: `json`

### Option B: Environment Variables
```bash
export AWS_ACCESS_KEY_ID=your-access-key-id
export AWS_SECRET_ACCESS_KEY=your-secret-access-key
export AWS_DEFAULT_REGION=us-west-2
```

### Option C: AWS Profile
```bash
aws configure --profile pickle-play-dates
export AWS_PROFILE=pickle-play-dates
```

## Step 2: Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this AWS account/region:

```bash
cd infra
npm install
npm run bootstrap
```

Expected output:
```
✨ Bootstrapping environment aws://123456789012/us-west-2...
CDKToolkit: creating CloudFormation changeset...
✅ Environment aws://123456789012/us-west-2 bootstrapped.
```

## Step 3: Build the Application

```bash
# From project root
./build-and-test.sh
```

This will:
- Install all dependencies
- Build all workspaces (shared-types, api-client, services, web, infra)
- Run unit tests
- Validate configurations

## Step 4: Deploy to Development

```bash
# Deploy infrastructure and services
npm run deploy:dev

# Or manually from infra directory:
cd infra
npm run deploy:dev
```

Expected deployment time: **5-10 minutes**

### Deployment Progress
You'll see output like:
```
✨ Deployment time: 482.12s

Outputs:
PicklePlayDatesStack-dev.ApiGatewayUrl = https://abc123def.execute-api.us-west-2.amazonaws.com/dev
PicklePlayDatesStack-dev.UserPoolId = us-west-2_ABC123DEF
PicklePlayDatesStack-dev.UserPoolClientId = 1234567890abcdef
PicklePlayDatesStack-dev.UserPoolDomain = pickle-play-dates-dev-auth.auth.us-west-2.amazoncognito.com
PicklePlayDatesStack-dev.CloudFrontUrl = https://d1234567890abc.cloudfront.net
PicklePlayDatesStack-dev.BucketName = pickle-play-dates-dev-bucket-abc123
```

**Important**: Save these outputs - you'll need them for integration tests!

## Step 5: Configure Integration Tests

```bash
cd integration-tests
cp .env.example .env
```

Edit `.env` with your deployment outputs:

```bash
# Integration Test Configuration
TEST_API_URL=https://abc123def.execute-api.us-west-2.amazonaws.com/dev
TEST_AUTH_TOKEN=your-cognito-jwt-token-here

# Test Configuration
SKIP_DESTRUCTIVE_TESTS=false
CLEANUP_AFTER_TESTS=true
DEBUG_API_CALLS=false
```

### Getting a Test Auth Token

You need a valid Cognito JWT token. Here are options:

#### Option A: Create Test User via AWS Console
1. Go to AWS Cognito Console
2. Find your User Pool (from deployment outputs)
3. Create a test user
4. Use AWS CLI to get token:

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-west-2_ABC123DEF \
  --client-id 1234567890abcdef \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=testuser@example.com,PASSWORD=TempPassword123!
```

#### Option B: Use the Web App
1. Deploy web app and visit CloudFront URL
2. Sign up/sign in with Google/Apple
3. Extract JWT token from browser dev tools (localStorage/sessionStorage)

#### Option C: Use AWS Amplify CLI (if available)
```bash
amplify auth signin
amplify auth tokens
```

## Step 6: Run Integration Tests

```bash
cd integration-tests
npm install
npm test
```

Expected output:
```bash
🧪 Integration Tests
========================

 PASS  src/__tests__/games.integration.test.ts (15.234 s)
   Games API Integration Tests
     Create Game
       ✓ should create a new game successfully (1523 ms)
       ✓ should reject invalid game data (234 ms)
       ✓ should reject games scheduled in the past (156 ms)
     Get Available Games
       ✓ should retrieve available games (445 ms)
       ✓ should filter games by query parameters (234 ms)
     [... more tests]

 PASS  src/__tests__/users.integration.test.ts (8.456 s)
   Users API Integration Tests
     Get User Profile
       ✓ should retrieve the current user profile (234 ms)
       ✓ should fail without authentication (123 ms)
     [... more tests]

Test Suites: 2 passed, 2 total
Tests:       24 passed, 24 total
Snapshots:   0 total
Time:        23.69 s
```

## Step 7: Verify Deployment

### API Health Check
```bash
curl https://your-api-url/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### Test API Endpoints
```bash
# Get available games (no auth required)
curl https://your-api-url/games

# Test with auth token
curl -H "Authorization: Bearer your-jwt-token" \
     https://your-api-url/users/me/profile
```

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Not Found
```bash
aws sts get-caller-identity
# Should return your AWS account info
```

#### 2. CDK Bootstrap Failed
```bash
# Check if region supports CDK
aws cloudformation describe-stacks --region us-west-2

# Or try different region
export AWS_DEFAULT_REGION=us-east-1
```

#### 3. Lambda Deployment Timeout
```bash
# Increase timeout and retry
cd infra
npm run deploy:dev -- --timeout=20m
```

#### 4. Integration Tests Failing
```bash
# Check API is accessible
curl -I https://your-api-url/health

# Verify auth token is valid
jwt-cli decode your-jwt-token

# Run tests with debug output
DEBUG_API_CALLS=true npm test
```

#### 5. CORS Issues
If you see CORS errors in the browser:
- Verify API Gateway CORS settings
- Check CloudFront distribution settings
- Ensure web app domain is whitelisted

### Checking Logs

#### CloudWatch Logs
```bash
# View Lambda function logs
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/pickle-play-dates"

# Tail specific function logs
aws logs tail /aws/lambda/pickle-play-dates-create-game-dev --follow
```

#### CDK Debug
```bash
cd infra
npm run synth    # See generated CloudFormation
npm run diff     # See what will change
```

## Step 8: Deploy to Production (Optional)

When ready for production:

```bash
# Deploy to production environment
npm run deploy:prod

# Or with confirmation
cd infra && npm run deploy:prod
```

Production deployment includes:
- Point-in-time recovery for DynamoDB
- Retain policy for data (no accidental deletion)
- Production-grade monitoring and alarms
- Separate Cognito user pool

## Next Steps

### 1. Web App Deployment
```bash
cd web
# Update environment variables with API URLs
npm run build
# Deploy to S3/CloudFront (automated in GitHub Actions)
```

### 2. Generate iOS SDK
```bash
swagger-codegen generate \
  -i openapi.yaml \
  -l swift5 \
  -o ios-sdk/ \
  --additional-properties projectName=PicklePlayDatesAPI
```

### 3. Set Up Monitoring
- CloudWatch dashboards
- Error alerts
- Performance monitoring
- Cost alerts

### 4. Domain Setup (Optional)
- Configure custom domain for API Gateway
- Set up SSL certificates
- Update DNS records

## Cost Estimation

Development environment should cost approximately:
- **Lambda**: ~$1-5/month (depending on usage)
- **DynamoDB**: ~$1-3/month (pay-per-request)
- **API Gateway**: ~$1-2/month
- **Cognito**: Free tier covers development
- **S3/CloudFront**: ~$1-2/month
- **Total**: ~$5-15/month for development

## Security Notes

- All API endpoints require authentication except public ones
- CORS is configured for web app domain only
- Cognito handles user authentication and JWT validation
- Lambda authorizer validates tokens on each request
- Environment variables and secrets are encrypted

🚀 **Your Pickle Play Dates API is now deployed and ready for iOS development!**