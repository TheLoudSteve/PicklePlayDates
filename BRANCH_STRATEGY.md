# 🌳 Branch Strategy & Deployment Pipeline

## Branch Structure (Solo Developer)

```
main (production) ←── Pull Request ←── develop (dev environment)
                                              ↑
                                         feature/xyz
                                         hotfix/abc
```

## Workflow Rules

### 📋 Daily Development
1. **Work on features**: Create `feature/feature-name` branches
2. **Test in dev**: Merge/push to `develop` → Auto-deploys to dev environment
3. **Deploy to prod**: Create PR from `develop` → `main` → Auto-deploys to production

### 🚨 Hotfixes
- Create `hotfix/issue-name` branches
- Can merge directly to `main` for critical production fixes
- Remember to merge back to `develop` afterward

## Automated Deployments

### Development Environment (develop branch)
- **Trigger**: Push to `develop` branch
- **Environment**: Development AWS resources
- **URL**: https://dodcyw1qbl5cy.cloudfront.net
- **API**: https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev
- **Auto-runs**: Tests, deployment, integration tests

### Production Environment (main branch)  
- **Trigger**: Push to `main` branch (via PR merge)
- **Environment**: Production AWS resources (when configured)
- **URL**: [Production CloudFront URL] 
- **API**: [Production API URL]
- **Auto-runs**: Tests, deployment, smoke tests

## GitHub Actions Pipeline

```yaml
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Push to   │    │     Run      │    │    Deploy       │
│   develop   │───▶│    Tests     │───▶│   to Dev        │
│             │    │              │    │   Environment   │
└─────────────┘    └──────────────┘    └─────────────────┘
                                                │
                                                ▼
                                        ┌─────────────────┐
                                        │  Run Integration│
                                        │     Tests       │
                                        └─────────────────┘

┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Push to   │    │     Run      │    │    Deploy       │
│    main     │───▶│    Tests     │───▶│   to Prod       │
│  (via PR)   │    │              │    │   Environment   │
└─────────────┘    └──────────────┘    └─────────────────┘
```

## Required GitHub Secrets

Add these to your GitHub repository settings:

### AWS Credentials
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_ACCOUNT_ID` - Your AWS account ID (916259710192)

### Optional Production Secrets (when you set up prod environment)
- `AWS_ACCESS_KEY_ID_PROD` - Production AWS credentials
- `AWS_SECRET_ACCESS_KEY_PROD` - Production AWS credentials

## Usage Examples

### 🔧 Working on a new feature
```bash
# Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/user-notifications

# Make changes, commit
git add .
git commit -m "Add push notification system"
git push origin feature/user-notifications

# Merge to develop (triggers dev deployment)
git checkout develop
git merge feature/user-notifications
git push origin develop  # 🚀 Auto-deploys to dev

# Test in dev environment, then create PR to main
```

### 🚀 Deploying to production
```bash
# After testing in dev, create PR from develop to main
gh pr create --base main --head develop --title "Release v1.2.0"

# Or via GitHub web interface
# When PR is merged, production deployment automatically triggers
```

### 🚨 Emergency hotfix
```bash
# Create hotfix directly from main
git checkout main
git pull origin main
git checkout -b hotfix/auth-bug-fix

# Fix the issue, commit
git add .
git commit -m "Fix authentication timeout issue"
git push origin hotfix/auth-bug-fix

# Merge directly to main (triggers prod deployment)
git checkout main
git merge hotfix/auth-bug-fix
git push origin main  # 🚀 Auto-deploys to prod

# Don't forget to merge back to develop
git checkout develop
git merge main
git push origin develop
```

## Environment URLs

| Environment | Branch | Auto-Deploy | Status | URLs |
|-------------|--------|-------------|---------|------|
| Development | `develop` | ✅ Yes | 🟢 Active | [Dev Web](https://dodcyw1qbl5cy.cloudfront.net), [Dev API](https://9vduzksk81.execute-api.us-west-2.amazonaws.com/dev) |
| Production | `main` | ✅ Yes | 🟡 Pending Setup | TBD |

## Next Steps

1. **✅ Set up GitHub secrets** for AWS credentials
2. **🔄 Test the pipeline** by pushing to develop
3. **⚙️ Configure production environment** when ready
4. **🔒 Set up branch protection rules** (optional but recommended)

---

*This workflow optimizes for solo development while maintaining production safety through automated testing and deployment.*