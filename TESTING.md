# Testing Guide for Pickle Play Dates

This guide covers how to build and test all components of the Pickle Play Dates project.

## Prerequisites

- **Node.js 18+** (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- **npm** (comes with Node.js)
- **AWS CLI** configured (for integration tests)
- **Git** for version control

## Quick Start

### 1. Install Dependencies

```bash
# Install all workspace dependencies
npm install
```

### 2. Build All Packages

```bash
# Use the automated build script
./build-and-test.sh

# Or build manually step by step:
npm run build
```

### 3. Run Tests

```bash
# Run all unit tests
npm test

# Run with coverage
cd services && npm run test:coverage
```

## Detailed Build Process

### Step 1: Build Shared Types

The shared types package must be built first as other packages depend on it.

```bash
cd shared-types
npm run build
cd ..
```

**Expected output:**
- `shared-types/dist/` directory with compiled TypeScript
- Type definition files (`.d.ts`)

### Step 2: Build API Client

```bash
cd api-client
npm run build
cd ..
```

**Expected output:**
- `api-client/dist/` directory with compiled client library
- Ready for import by web and mobile apps

### Step 3: Build Services (Lambda Functions)

```bash
cd services
npm run build
cd ..
```

**Expected output:**
- `services/dist/` directory with compiled Lambda functions
- Ready for AWS deployment

### Step 4: Build Web Application

```bash
cd web
npm run build
cd ..
```

**Expected output:**
- `web/.next/` or `web/out/` directory with production build
- Static files ready for deployment

### Step 5: Build Infrastructure

```bash
cd infra
npm run build
cd ..
```

**Expected output:**
- `infra/lib/*.js` files compiled from TypeScript
- Ready for CDK deployment

## Testing Strategy

### Unit Tests

#### Services Tests (Lambda Functions)

```bash
cd services
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

**Test Coverage:**
- ✅ `create-game` - Game creation with validation
- ✅ `join-game` - Joining games and error cases  
- ✅ `cancel-game` - Game cancellation by organizer/admin
- ✅ `leave-game` - Leaving games with constraints
- ✅ `kick-player` - Admin/organizer player management
- ✅ `get-user-schedule` - User schedule retrieval
- ✅ `shared/utils` - Utility functions

**Test Files:**
```
services/src/
├── create-game/__tests__/index.test.ts
├── join-game/__tests__/index.test.ts  
├── cancel-game/__tests__/index.test.ts
├── leave-game/__tests__/index.test.ts
├── kick-player/__tests__/index.test.ts
├── get-user-schedule/__tests__/index.test.ts
└── shared/__tests__/utils.test.ts
```

#### API Client Tests

```bash
cd api-client
npm test
npm run test:watch
```

**Coverage includes:**
- HTTP client with retry logic
- Error handling and type safety
- Authentication flows
- Request/response mapping

### Integration Tests

Integration tests verify the entire API flow end-to-end.

#### Setup

1. Copy environment configuration:
```bash
cd integration-tests
cp .env.example .env
```

2. Configure test environment:
```bash
# .env file
TEST_API_URL=https://api-dev.pickleplaydates.com
TEST_AUTH_TOKEN=your-cognito-jwt-token
TEST_USER_EMAIL=test@example.com
CLEANUP_AFTER_TESTS=true
```

#### Run Integration Tests

```bash
cd integration-tests
npm test                     # All tests
npm run test:dev            # Dev environment only
npm run test:staging        # Staging environment only
npm run test:ci             # CI mode with coverage
```

**Test Coverage:**
- ✅ Game CRUD operations
- ✅ User profile management
- ✅ Court search and management
- ✅ Authentication flows
- ✅ Error handling scenarios
- ✅ API client retry logic

### Code Quality

#### Linting

```bash
npm run lint                 # Check all workspaces
cd services && npm run lint  # Specific workspace
```

#### Formatting

```bash
npm run format              # Fix formatting
npm run format:check        # Check formatting only
```

#### Pre-commit Hooks

The project uses Husky for automated quality checks:

```bash
# Install hooks (run once)
npm run prepare

# Hooks automatically run on:
git commit    # Runs lint-staged, tests, formatting
```

## Test Scenarios

### Game Management Tests

```typescript
// Example test scenarios covered:
describe('Games API', () => {
  it('creates game with valid data')
  it('rejects games in the past')
  it('validates player limits (2-8)')
  it('enforces DUPR level constraints')
  it('handles court availability')
  it('manages game status transitions')
  it('prevents late joins/leaves (1hr cutoff)')
})
```

### User Profile Tests

```typescript
describe('User Profile API', () => {
  it('updates profile fields independently')
  it('validates phone number format (E.164)')
  it('validates DUPR skill levels')
  it('manages notification preferences')
  it('handles authentication errors')
})
```

### Error Handling Tests

```typescript
describe('Error Handling', () => {
  it('handles network timeouts')
  it('retries on server errors (5xx)')
  it('validates request data (422)')
  it('manages authentication (401)')
  it('enforces authorization (403)')
  it('handles rate limiting (429)')
})
```

## Test Data Management

### Fixtures

Test data is managed through:
- **Mock data** for unit tests
- **Factory functions** for consistent test objects
- **Cleanup routines** for integration tests

### Cleanup

Integration tests automatically clean up created data:

```typescript
// Automatic cleanup after tests
afterAll(async () => {
  await cleanupTestGames()
  await cleanupTestCourts()
})
```

## Continuous Integration

### GitHub Actions Workflow

The CI pipeline runs:
1. **Build** all workspaces
2. **Unit tests** with coverage
3. **Lint** and format checks
4. **Integration tests** (on dev environment)
5. **Deployment** (on success)

### Coverage Requirements

- **Minimum 80%** line coverage for Lambda functions
- **Type coverage** enforced by TypeScript strict mode
- **Integration coverage** for critical user flows

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Clear all node_modules and reinstall
rm -rf node_modules */node_modules
npm install

# Rebuild from scratch
npm run clean && npm run build
```

#### Test Failures

```bash
# Run tests in isolation
npm test -- --runInBand

# Debug specific test
npm test -- --testNamePattern="Game creation"

# Update snapshots
npm test -- --updateSnapshot
```

#### TypeScript Errors

```bash
# Check all TypeScript files
npx tsc --noEmit

# Fix auto-fixable issues
npm run lint -- --fix
```

### Environment Issues

#### Missing Node.js

```bash
# Install via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Missing AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-west-2
```

## Performance Testing

### Load Testing (Optional)

For API performance validation:

```bash
# Install artillery (global)
npm install -g artillery

# Run load tests
artillery run load-tests/games-api.yml
```

## Next Steps

After successful testing:

1. **Deploy to Development**
   ```bash
   npm run deploy:dev
   ```

2. **Generate iOS SDK**
   ```bash
   swagger-codegen generate -i openapi.yaml -l swift5 -o ios-sdk/
   ```

3. **Deploy to Production**
   ```bash
   git commit -m "feat: ready for production [deploy:prod]"
   git push origin main
   ```

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [TypeScript Testing](https://jestjs.io/docs/getting-started#using-typescript)
- [AWS Lambda Testing](https://docs.aws.amazon.com/lambda/latest/dg/testing-guide.html)
- [OpenAPI Testing](https://swagger.io/tools/swagger-codegen/)