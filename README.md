# Pickle Play Dates

A serverless pickleball game scheduling app built with Next.js, AWS CDK, and TypeScript.

## 🏗️ Architecture

- **Frontend**: Next.js 15 (App Router) with TypeScript, Tailwind CSS, and PWA support
- **Authentication**: AWS Cognito with Google and Apple Sign-In
- **Backend**: AWS Lambda functions (TypeScript) behind API Gateway
- **Database**: DynamoDB single-table design with GSI for efficient queries
- **Storage**: S3 + CloudFront for static web hosting
- **Notifications**: SES email + SNS (mobile push placeholder)
- **Infrastructure**: AWS CDK v2 with TypeScript
- **CI/CD**: GitHub Actions

## 📋 Prerequisites

- **Node.js** 18+ (we recommend using [nvm](https://github.com/nvm-sh/nvm))
- **AWS CLI** configured with credentials
- **AWS CDK CLI** (`npm install -g aws-cdk`)
- **Git** for version control

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd PicklePlayDates
npm install
```

### 2. Bootstrap AWS CDK (First Time Only)

```bash
npm run bootstrap
```

This sets up the CDK deployment resources in your AWS account.

### 3. Deploy Development Environment

```bash
npm run deploy:dev
```

This will:
- Create all AWS resources (DynamoDB, Lambda, API Gateway, Cognito, S3, CloudFront)
- Deploy Lambda functions
- Output important URLs and resource IDs

### 4. Configure Authentication Providers

After deployment, you'll need to manually configure:

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add the Cognito domain to authorized origins
4. Update the Cognito Google Identity Provider with your client ID and secret

#### Apple Sign-In
1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Create Sign in with Apple configuration
3. Update the Cognito Apple Identity Provider with your credentials

### 5. Deploy Frontend

```bash
cd web
# Set environment variables from CDK outputs
export NEXT_PUBLIC_API_URL="<API_GATEWAY_URL>"
export NEXT_PUBLIC_USER_POOL_ID="<USER_POOL_ID>"
export NEXT_PUBLIC_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
export NEXT_PUBLIC_USER_POOL_DOMAIN="<USER_POOL_DOMAIN>"

npm run build
```

Upload the built files to your S3 bucket or use the GitHub Actions workflow.

## 🏗️ Project Structure

```
PicklePlayDates/
├── infra/                 # AWS CDK infrastructure code
│   ├── bin/app.ts         # CDK app entry point
│   ├── lib/               # CDK stacks and constructs
│   └── package.json       # CDK dependencies
├── services/              # Lambda function source code
│   ├── src/
│   │   ├── shared/        # Shared utilities and types
│   │   ├── create-game/   # Individual Lambda functions
│   │   ├── join-game/
│   │   └── ...
│   └── package.json       # Lambda dependencies
├── web/                   # Next.js frontend
│   ├── src/
│   │   ├── app/           # Next.js App Router pages
│   │   ├── components/    # React components
│   │   └── lib/           # Frontend utilities
│   └── package.json       # Frontend dependencies
└── .github/workflows/     # CI/CD pipelines
```

## 📱 Features

### User Management
- **Authentication**: Google and Apple Sign-In via AWS Cognito
- **User Profiles**: Name, phone (E.164), DUPR skill level
- **Role-based Access**: Organizer and Admin groups

### Game Management
- **Create Games**: Set date/time, location, player limits (2-8)
- **Join/Leave**: Users can join/leave games until 1 hour before start
- **Game Status**: Scheduled → Closed (when full) → Past → Cancelled
- **Organizer Controls**: Cancel games, kick players

### Schedule Management
- **My Schedule**: View upcoming and past games
- **Real-time Updates**: DynamoDB streams trigger notifications
- **Time Zone Handling**: All times stored in UTC, displayed in local time

### Notifications
- **Email Notifications**: Game full, game cancelled (via SES)
- **Mobile Push**: SNS integration (placeholder for future implementation)

## 🔧 API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/games` | Create a new game | ✅ |
| GET | `/games/{gameId}` | Get game details | ❌ |
| POST | `/games/{gameId}/join` | Join a game | ✅ |
| POST | `/games/{gameId}/leave` | Leave a game | ✅ |
| DELETE | `/games/{gameId}` | Cancel a game | ✅ (Organizer/Admin) |
| DELETE | `/games/{gameId}/players/{userId}` | Kick a player | ✅ (Organizer/Admin) |
| GET | `/users/me/schedule?range=upcoming\|past` | Get user's games | ✅ |
| PUT | `/users/me` | Update user profile | ✅ |

## 💾 Data Model

### DynamoDB Single-Table Design

| PK | SK | Description |
|----|----|----|
| `USER#{userId}` | `PROFILE` | User profile data |
| `GAME#{gameId}` | `METADATA` | Game details |
| `GAME#{gameId}` | `PLAYER#{userId}` | Game participants |

### Global Secondary Indexes

1. **GSI1**: User's upcoming games (`USER#{userId}` → `GAME#{datetime}`)
2. **GSI2**: User's past games (same structure, filtered by datetime)

## 🔒 Security

- **Authentication**: JWT tokens from Cognito
- **Authorization**: Lambda authorizer validates tokens
- **CORS**: Configured for web app domain
- **IAM**: Least privilege access for all resources
- **Data Validation**: Input validation in Lambda functions

## 💰 Cost Management

- **Pay-per-request**: DynamoDB and Lambda pricing
- **Free Tier**: Most services have generous free tiers
- **Budget Alert**: CloudWatch alarm at $20/month
- **Resource Optimization**: CDK configured for cost efficiency

## 🧪 Testing

### Run Tests
```bash
# All tests
npm test

# Services only
cd services && npm test

# With coverage
cd services && npm run test:coverage
```

### Test Coverage Target
- Minimum 80% coverage for Lambda functions
- Unit tests for business logic
- Integration tests for API endpoints

## 🚢 Deployment

### Development
```bash
npm run deploy:dev
```

### Production
```bash
npm run deploy:prod
```

### CI/CD with GitHub Actions
1. Push to `main` branch deploys to development
2. Commit message with `[deploy:prod]` deploys to production
3. Required secrets in GitHub repository settings

## 🔧 Configuration

### Environment Variables

#### CDK Deployment
- `CDK_DEFAULT_ACCOUNT`: AWS account ID
- `CDK_DEFAULT_REGION`: AWS region

#### Frontend
- `NEXT_PUBLIC_API_URL`: API Gateway base URL
- `NEXT_PUBLIC_USER_POOL_ID`: Cognito User Pool ID
- `NEXT_PUBLIC_USER_POOL_CLIENT_ID`: Cognito App Client ID
- `NEXT_PUBLIC_USER_POOL_DOMAIN`: Cognito Domain

#### Lambda Functions (set by CDK)
- `TABLE_NAME`: DynamoDB table name
- `SES_CONFIGURATION_SET`: SES configuration set
- `SNS_TOPIC_ARN`: SNS topic for notifications

## 📝 Development Workflow

1. **Feature Development**
   ```bash
   git checkout -b feature/new-feature
   # Make changes
   npm test
   git commit -m "Add new feature"
   git push origin feature/new-feature
   ```

2. **Testing Changes**
   ```bash
   npm run deploy:dev  # Deploy to development environment
   # Test your changes
   ```

3. **Production Deployment**
   ```bash
   git checkout main
   git merge feature/new-feature
   git commit -m "Deploy new feature [deploy:prod]"
   git push origin main
   ```

## 🐛 Troubleshooting

### Common Issues

1. **CDK Bootstrap Required**
   ```bash
   cdk bootstrap aws://ACCOUNT-NUMBER/REGION
   ```

2. **Lambda Function Deployment Fails**
   - Ensure services are built: `cd services && npm run build`
   - Check Lambda function code in `services/dist/`

3. **Frontend Build Fails**
   - Check environment variables are set
   - Verify API endpoints are accessible

4. **Authentication Issues**
   - Verify Cognito configuration
   - Check redirect URLs match your domain
   - Ensure identity providers are properly configured

### Logs and Monitoring

- **CloudWatch Logs**: Lambda function logs
- **X-Ray Tracing**: Distributed tracing enabled
- **API Gateway Logs**: Request/response logging
- **Budget Alerts**: Cost monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For questions or issues:
1. Check the troubleshooting section
2. Review CloudWatch logs
3. Create an issue in the repository

---

**Success Criterion**: After following this guide, you should be able to:
1. Deploy the infrastructure with `npm run deploy:dev`
2. Access the app at the CloudFront URL
3. Sign in with Google/Apple
4. Create a game, join with a second account, and receive email notifications # PicklePlayDates
