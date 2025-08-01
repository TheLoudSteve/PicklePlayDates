# 🔐 OAuth Provider Setup Guide

This guide explains how to securely configure Google OAuth for your Pickle Play Dates app. Apple Sign-In has been temporarily removed for easier setup.

## 📋 **Quick Setup**

1. **Copy the environment template:**
   ```bash
   cd infra
   cp .env.example .env
   ```

2. **Fill in your Google credentials** in `infra/.env` (see detailed steps below)

3. **Deploy:**
   ```bash
   npm run deploy:dev
   ```

## ⚡ **Deploy Without OAuth (Fastest)**

You can deploy immediately without OAuth setup for username/password authentication:

```bash
npm run deploy:dev
```

Then add Google OAuth later by following the steps below.

## 🔄 **Google OAuth Setup**

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google+ API** (for OAuth)

### Step 2: Configure OAuth Consent Screen
1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type
3. Fill in required fields:
   - App name: "Pickle Play Dates"
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`
5. Save and continue

### Step 3: Create OAuth Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth 2.0 Client IDs**
3. Application type: **Web application**
4. Name: "Pickle Play Dates Web Client"
5. **Authorized redirect URIs:** Add these:
   ```
   https://pickle-play-dates-dev-[YOUR-ACCOUNT-ID].auth.us-west-2.amazoncognito.com/oauth2/idpresponse
   ```
   (Replace `[YOUR-ACCOUNT-ID]` with your AWS account ID - check AWS console)

6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Step 4: Add to Environment
In `infra/.env`:
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

## 🍎 **Apple Sign-In Setup**

### Step 1: Apple Developer Account
1. You need a paid Apple Developer account ($99/year)
2. Go to [Apple Developer Portal](https://developer.apple.com/)

### Step 2: Create App ID
1. Go to **Certificates, Identifiers & Profiles**
2. Click **Identifiers** → **+** (Add new)
3. Select **App IDs** → **Continue**
4. Choose **App** → **Continue**
5. Fill in:
   - Description: "Pickle Play Dates"
   - Bundle ID: `com.yourcompany.pickleplaydates` (use your domain)
6. Check **Sign In with Apple** capability
7. Click **Continue** → **Register**

### Step 3: Create Service ID
1. In **Identifiers**, click **+** again
2. Select **Services IDs** → **Continue**  
3. Fill in:
   - Description: "Pickle Play Dates Web Service"
   - Identifier: `com.yourcompany.pickleplaydates.service`
4. Check **Sign In with Apple**
5. Click **Configure** next to Sign In with Apple
6. Add domain: `amazonaws.com`
7. Add redirect URL:
   ```
   https://pickle-play-dates-dev-[YOUR-ACCOUNT-ID].auth.us-west-2.amazoncognito.com/oauth2/idpresponse
   ```
8. Click **Next** → **Done** → **Continue** → **Register**

### Step 4: Create Private Key
1. Go to **Keys** → **+** (Add new)
2. Key Name: "Pickle Play Dates Sign In with Apple"
3. Check **Sign In with Apple**
4. Click **Configure** → Select your App ID → **Save**
5. Click **Continue** → **Register**
6. **Download the .p8 file** (you can only download once!)
7. Note the **Key ID** (10-character string)

### Step 5: Get Team ID
1. In Apple Developer portal, your **Team ID** is shown in the top right
2. It's a 10-character alphanumeric string

### Step 6: Add to Environment
In `infra/.env`:
```bash
APPLE_CLIENT_ID=com.yourcompany.pickleplaydates.service
APPLE_TEAM_ID=YOUR10CHAR
APPLE_KEY_ID=YOUR10CHAR  
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
[content of your .p8 file]
...
-----END PRIVATE KEY-----"
```

## 🚀 **Deployment**

### Option 1: Deploy with OAuth Providers
If you have credentials in `.env`:
```bash
npm run deploy:dev
```

### Option 2: Deploy without OAuth (Username/Password only)
If you haven't set up OAuth yet:
```bash
cd infra
rm .env  # or rename to .env.backup
npm run deploy:dev
```

## 🛡️ **Security Notes**

- ✅ **DO:** Store credentials in `infra/.env` (git-ignored)
- ✅ **DO:** Use different credentials for dev/prod environments  
- ❌ **DON'T:** Commit `.env` to git
- ❌ **DON'T:** Share credentials in Slack/email
- ❌ **DON'T:** Put credentials directly in code

## 🔧 **Troubleshooting**

### "Invalid redirect URI"
- Make sure redirect URI exactly matches in both Google/Apple and AWS
- Check your AWS account ID in the domain
- Ensure no trailing slashes

### "Invalid client credentials"  
- Double-check client ID/secret formatting
- Ensure no extra spaces or newlines
- For Apple: verify the private key format

### "App not found"
- For Apple: ensure Service ID is properly configured
- Check that the client ID matches your Service ID identifier

## 📚 **Next Steps**

After setting up OAuth:
1. Test Google sign-in in your deployed app
2. Test Apple sign-in (if configured)
3. Set up production environment with separate credentials
4. Configure your production domain redirects

## 🆘 **Need Help?**

- Google OAuth: [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- Apple Sign-In: [Apple Sign-In Documentation](https://developer.apple.com/sign-in-with-apple/)
- AWS Cognito: [Cognito Identity Providers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-identity-provider.html)