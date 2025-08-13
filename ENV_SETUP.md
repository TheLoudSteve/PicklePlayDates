# Environment Configuration Guide

This guide explains all the `.env` files needed for the Pickle Play Dates application.

## 📁 Environment Files Overview

### **✅ Required for Basic Functionality**

#### 1. Web Application (`/web/.env.local`) 
**Status: ✅ Created and configured**

```bash
# Already configured with your deployment values:
NEXT_PUBLIC_API_URL=https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev
NEXT_PUBLIC_USER_POOL_ID=us-west-2_nxJAslgC2
NEXT_PUBLIC_USER_POOL_CLIENT_ID=it72qbeabqlqmqkr3c06mhshi
NEXT_PUBLIC_USER_POOL_DOMAIN=pickle-play-dates-dev-916259710192
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_ENVIRONMENT=development
```

#### 2. Integration Tests (`/integration-tests/.env`)
**Status: ✅ Created and configured**

```bash
# Already configured with your deployment values:
TEST_API_URL=https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev
TEST_AUTH_TOKEN=your-cognito-jwt-token-here  # ⚠️ You need to add this
TEST_USER_EMAIL=testuser@pickleplaydates.com
TEST_USER_PASSWORD=TestPassword123!
```

### **⚠️ Optional (for Enhanced Features)**

#### 3. Infrastructure OAuth (`/infra/.env`)
**Status: ⚠️ Optional - only needed for Google/Apple Sign-In**

```bash
# Only create this file if you want OAuth providers
# Copy from /infra/.env.example and fill in your OAuth credentials
```

## 🚀 Quick Setup Commands

### **Deploy Web Application (Recommended Next Step)**

```bash
# Navigate to web directory
cd web

# Verify environment variables are set
cat .env.local

# Build and deploy to CloudFront
npm run build
aws s3 sync out/ s3://pickle-play-dates-web-dev-916259710192 --delete

# Your web app will be live at:
# https://dodcyw1qbl5cy.cloudfront.net
```

### **Run Integration Tests**

```bash
# Navigate to integration tests
cd integration-tests

# First, get an auth token (see instructions below)
# Then run tests
npm test
```

## 🔐 Getting Authentication Token for Integration Tests

### **Option 1: Enable ADMIN_NO_SRP_AUTH (Easiest)**

1. Go to [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Find User Pool: `us-west-2_nxJAslgC2`
3. Go to App Integration → App clients → `it72qbeabqlqmqkr3c06mhshi`
4. Edit Authentication flows → Enable "ADMIN_NO_SRP_AUTH"
5. Save changes
6. Run this command:

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id us-west-2_nxJAslgC2 \
  --client-id it72qbeabqlqmqkr3c06mhshi \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME=testuser@pickleplaydates.com,PASSWORD=TestPassword123!
```

7. Copy the `AccessToken` from the response
8. Update `integration-tests/.env`:
```bash
TEST_AUTH_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...your-token-here
```

### **Option 2: Use Web App (After Deployment)**

1. Deploy web app (see commands above)
2. Visit: https://dodcyw1qbl5cy.cloudfront.net
3. Sign in with test credentials
4. Open browser dev tools → Application → Local Storage
5. Find the JWT token and copy it
6. Update `integration-tests/.env`

## 📱 Environment Files for Different Deployments

### **Development Environment**
```
✅ web/.env.local (configured)
✅ integration-tests/.env (configured) 
⚠️ infra/.env (optional)
```

### **Production Environment**
When you deploy to production, you'll need:

```bash
# web/.env.production
NEXT_PUBLIC_API_URL=https://your-prod-api.execute-api.region.amazonaws.com/prod
NEXT_PUBLIC_USER_POOL_ID=your-prod-user-pool-id
# ... other prod values

# integration-tests/.env.prod  
TEST_API_URL=https://your-prod-api.execute-api.region.amazonaws.com/prod
# ... other prod test values
```

## 🔧 Environment Variables by Component

### **Web App Variables (Next.js)**
| Variable | Purpose | Required |
|----------|---------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API endpoint | ✅ Yes |
| `NEXT_PUBLIC_USER_POOL_ID` | Cognito User Pool | ✅ Yes |
| `NEXT_PUBLIC_USER_POOL_CLIENT_ID` | Cognito App Client | ✅ Yes |
| `NEXT_PUBLIC_USER_POOL_DOMAIN` | Cognito Domain | ✅ Yes |
| `NEXT_PUBLIC_AWS_REGION` | AWS Region | ✅ Yes |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps integration | ❌ Optional |
| `NEXT_PUBLIC_GA_ID` | Google Analytics | ❌ Optional |

### **Integration Test Variables**
| Variable | Purpose | Required |
|----------|---------|----------|
| `TEST_API_URL` | API endpoint to test | ✅ Yes |
| `TEST_AUTH_TOKEN` | JWT for authenticated tests | ✅ Yes |
| `TEST_USER_EMAIL` | Test user email | ✅ Yes |
| `TEST_USER_PASSWORD` | Test user password | ✅ Yes |
| `CLEANUP_AFTER_TESTS` | Clean up test data | ❌ Optional |
| `DEBUG_API_CALLS` | Debug API requests | ❌ Optional |

### **Infrastructure Variables (CDK)**
| Variable | Purpose | Required |
|----------|---------|----------|
| `GOOGLE_CLIENT_ID` | Google OAuth | ❌ Optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | ❌ Optional |
| `APPLE_CLIENT_ID` | Apple Sign-In | ❌ Optional |
| `APPLE_KEY_ID` | Apple Sign-In | ❌ Optional |
| `APPLE_TEAM_ID` | Apple Sign-In | ❌ Optional |
| `APPLE_PRIVATE_KEY` | Apple Sign-In | ❌ Optional |

### **Lambda Functions (Set by CDK automatically)**
These are automatically configured during deployment:
- `TABLE_NAME` - DynamoDB table name
- `SES_CONFIGURATION_SET` - Email service
- `SNS_TOPIC_ARN` - Push notifications
- `ENVIRONMENT` - dev/prod

## 📋 Verification Checklist

### **✅ Current Status:**
- [x] API deployed and running
- [x] Web app `.env.local` configured
- [x] Integration tests `.env` configured
- [x] Test user created in Cognito
- [x] CloudFront distribution ready

### **🎯 Next Steps:**
- [ ] Get auth token for integration tests
- [ ] Deploy web app to CloudFront
- [ ] Run integration tests
- [ ] Configure OAuth providers (optional)
- [ ] Set up production environment

## 🆘 Troubleshooting

### **Web App Build Fails**
```bash
# Check environment variables
cd web && cat .env.local

# Verify API is accessible
curl https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev/games
```

### **Integration Tests Fail**
```bash
# Check environment variables
cd integration-tests && cat .env

# Test API directly
curl -H "Authorization: Bearer $TEST_AUTH_TOKEN" \
  https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev/users/me/profile
```

### **OAuth Issues**
```bash
# Check CDK deployment logs
cd infra && npm run deploy:dev
```

## 🚀 Ready to Go!

Your environment is configured and ready for:

1. **Web App Deployment:** `cd web && npm run build && aws s3 sync out/ s3://pickle-play-dates-web-dev-916259710192`
2. **Integration Testing:** `cd integration-tests && npm test` (after getting auth token)
3. **iOS Development:** Generate SDK with `swagger-codegen generate -i openapi.yaml -l swift5 -o ios-sdk/`

All the necessary `.env` files are created and configured with your deployment values! 🎉