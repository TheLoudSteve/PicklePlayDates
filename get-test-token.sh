#!/bin/bash

# Script to get a test authentication token for integration tests

USER_POOL_ID="us-west-2_nxJAslgC2"
USER_POOL_CLIENT_ID="it72qbeabqlqmqkr3c06mhshi"

echo "🔐 Getting Test Authentication Token"
echo "=================================="
echo ""
echo "User Pool ID: $USER_POOL_ID"
echo "Client ID: $USER_POOL_CLIENT_ID"
echo ""

# Check if user already exists
read -p "Enter test user email: " TEST_EMAIL
read -s -p "Enter test user password: " TEST_PASSWORD
echo ""

echo ""
echo "Creating test user in Cognito..."

# Create user (this might fail if user already exists - that's okay)
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username "$TEST_EMAIL" \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true \
  --temporary-password "$TEST_PASSWORD" \
  --message-action SUPPRESS \
  2>/dev/null || echo "User might already exist - continuing..."

echo ""
echo "Setting permanent password..."

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username "$TEST_EMAIL" \
  --password "$TEST_PASSWORD" \
  --permanent \
  2>/dev/null || echo "Password setting might have failed - continuing..."

echo ""
echo "Getting authentication token..."

# Get authentication token
AUTH_RESPONSE=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $USER_POOL_CLIENT_ID \
  --auth-flow ADMIN_NO_SRP_AUTH \
  --auth-parameters USERNAME="$TEST_EMAIL",PASSWORD="$TEST_PASSWORD" \
  2>/dev/null)

if [ $? -eq 0 ]; then
  # Extract the access token
  ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.AccessToken')
  ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')
  
  if [ "$ACCESS_TOKEN" != "null" ] && [ "$ACCESS_TOKEN" != "" ]; then
    echo ""
    echo "✅ SUCCESS! Authentication token obtained:"
    echo ""
    echo "Access Token (use this for API calls):"
    echo "$ACCESS_TOKEN"
    echo ""
    echo "ID Token:"
    echo "$ID_TOKEN"
    echo ""
    echo "To use in integration tests, update integration-tests/.env:"
    echo "TEST_AUTH_TOKEN=$ACCESS_TOKEN"
    echo ""
    
    # Automatically update .env file if it exists
    if [ -f "integration-tests/.env" ]; then
      if command -v sed >/dev/null 2>&1; then
        sed -i.bak "s|TEST_AUTH_TOKEN=.*|TEST_AUTH_TOKEN=$ACCESS_TOKEN|" integration-tests/.env
        echo "✅ Updated integration-tests/.env with new token"
      fi
    fi
  else
    echo "❌ Failed to extract token from response"
    echo "Response: $AUTH_RESPONSE"
  fi
else
  echo "❌ Authentication failed"
  echo ""
  echo "Possible issues:"
  echo "1. User doesn't exist yet - try creating manually in AWS Cognito Console"
  echo "2. Password doesn't meet requirements"
  echo "3. User needs email verification"
  echo ""
  echo "Manual steps:"
  echo "1. Go to AWS Cognito Console"
  echo "2. Find User Pool: $USER_POOL_ID"
  echo "3. Create user manually"
  echo "4. Set permanent password"
  echo "5. Run this script again"
fi

echo ""
echo "🧪 Next steps:"
echo "=============="
echo "1. Verify token is set in integration-tests/.env"
echo "2. Run integration tests: cd integration-tests && npm test"
echo "3. Check test results and API functionality"