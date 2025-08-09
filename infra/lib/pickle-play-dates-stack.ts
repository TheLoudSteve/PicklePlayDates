import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface PicklePlayDatesStackProps extends cdk.StackProps {
  environment: string;
}

export class PicklePlayDatesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PicklePlayDatesStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB Table with single-table design
    const table = new dynamodb.Table(this, 'PicklePlayDatesTable', {
      tableName: `pickle-play-dates-${environment}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: environment === 'prod',
    });

    // GSI for games by user (future)
    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    });

    // GSI for games by user (past)
    table.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
    });

    // S3 Bucket for static hosting
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `pickle-play-dates-web-${environment}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
    });

    // Origin Access Control for CloudFront
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      originAccessControlName: `pickle-play-dates-oac-${environment}`,
      description: 'OAC for Pickle Play Dates website',
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Update bucket policy for OAC
    websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudFrontServicePrincipalReadOnly',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [websiteBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `pickle-play-dates-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Groups
    new cognito.CfnUserPoolGroup(this, 'OrganiserGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'organiser',
      description: 'Users who can organize games',
    });

    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Administrative users',
    });

    // User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: `pickle-play-dates-client-${environment}`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          `https://${distribution.distributionDomainName}`,
          'http://localhost:3000',
        ],
        logoutUrls: [
          `https://${distribution.distributionDomainName}`,
          'http://localhost:3000',
        ],
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });

    // Cognito Domain
    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      cognitoDomain: {
        domainPrefix: `pickle-play-dates-${environment}-${this.account}`,
      },
    });

    // Google Identity Provider (only created if environment variables are provided)
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (googleClientId && googleClientSecret) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
        userPool,
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        scopes: ['email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });
    } else {
      console.log('🔐 Google OAuth credentials not found in environment variables. Skipping Google provider.');
    }

    // Apple Identity Provider - Temporarily removed
    // To add Apple Sign-In later:
    // 1. Follow the setup guide in OAUTH_SETUP.md
    // 2. Add Apple credentials to .env
    // 3. Uncomment the Apple provider code
    console.log('🍎 Apple Sign-In is disabled. Enable it later by following OAUTH_SETUP.md');

    // SES Configuration
    const sesConfigurationSet = new ses.ConfigurationSet(this, 'SESConfigurationSet', {
      configurationSetName: `pickle-play-dates-${environment}`,
    });

    // SNS Topic for notifications
    const notificationTopic = new sns.Topic(this, 'NotificationTopic', {
      topicName: `pickle-play-dates-notifications-${environment}`,
    });

    // Lambda Execution Role
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AWSXRayDaemonWriteAccess'),
      ],
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                table.tableArn,
                `${table.tableArn}/index/*`,
              ],
            }),
          ],
        }),
        SESAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['ses:SendEmail', 'ses:SendRawEmail'],
              resources: ['*'],
            }),
          ],
        }),
        SNSAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['sns:Publish'],
              resources: [notificationTopic.topicArn],
            }),
          ],
        }),
      },
    });

    // API Gateway
    const api = new apigateway.RestApi(this, 'PicklePlayDatesAPI', {
      restApiName: `pickle-play-dates-api-${environment}`,
      description: 'API for Pickle Play Dates application',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://dodcyw1qbl5cy.cloudfront.net', 'http://localhost:3000'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: environment,
        tracingEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
    });

    // Cognito Authorizer  
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'CognitoAuthorizer',
      resultsCacheTtl: cdk.Duration.seconds(0), // Disable caching to avoid CORS issues
    });

    // Add Gateway Responses for CORS on authorization failures
    api.addGatewayResponse('unauthorized', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://dodcyw1qbl5cy.cloudfront.net'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    api.addGatewayResponse('forbidden', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://dodcyw1qbl5cy.cloudfront.net'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    api.addGatewayResponse('bad-request-body', {
      type: apigateway.ResponseType.BAD_REQUEST_BODY,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://dodcyw1qbl5cy.cloudfront.net'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    api.addGatewayResponse('default-5xx', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'https://dodcyw1qbl5cy.cloudfront.net'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
        'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
        'Access-Control-Allow-Credentials': "'true'",
      },
    });

    // Helper function to create Lambda without deprecated logRetention
    const createLambdaFunction = (id: string, functionName: string, handler: string) => {
      return new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_20_X,
        role: lambdaExecutionRole,
        environment: {
          TABLE_NAME: table.tableName,
          SES_CONFIGURATION_SET: sesConfigurationSet.configurationSetName,
          SNS_TOPIC_ARN: notificationTopic.topicArn,
          ENVIRONMENT: environment,
        },
        timeout: cdk.Duration.seconds(30),
        tracing: lambda.Tracing.ACTIVE,
        functionName: functionName,
        code: lambda.Code.fromAsset('../services/dist'),
        handler: handler,
        // Note: We're not setting logGroup or logRetention
        // Lambda will create log groups automatically with default settings
      });
    };

    // Create all Lambda functions
    const createGameLambda = createLambdaFunction(
      'CreateGameFunction',
      `pickle-play-dates-create-game-${environment}`,
      'create-game/index.handler'
    );

    const getGameLambda = createLambdaFunction(
      'GetGameFunction',
      `pickle-play-dates-get-game-${environment}`,
      'get-game/index.handler'
    );

    const getAvailableGamesLambda = createLambdaFunction(
      'GetAvailableGamesFunction',
      `pickle-play-dates-get-available-games-${environment}`,
      'get-available-games/index.handler'
    );

    const joinGameLambda = createLambdaFunction(
      'JoinGameFunction',
      `pickle-play-dates-join-game-${environment}`,
      'join-game/index.handler'
    );

    const leaveGameLambda = createLambdaFunction(
      'LeaveGameFunction',
      `pickle-play-dates-leave-game-${environment}`,
      'leave-game/index.handler'
    );

    const updateGameLambda = createLambdaFunction(
      'UpdateGameFunction',
      `pickle-play-dates-update-game-${environment}`,
      'update-game/index.handler'
    );

    const cancelGameLambda = createLambdaFunction(
      'CancelGameFunction',
      `pickle-play-dates-cancel-game-${environment}`,
      'cancel-game/index.handler'
    );

    const kickPlayerLambda = createLambdaFunction(
      'KickPlayerFunction',
      `pickle-play-dates-kick-player-${environment}`,
      'kick-player/index.handler'
    );

    const getUserScheduleLambda = createLambdaFunction(
      'GetUserScheduleFunction',
      `pickle-play-dates-get-user-schedule-${environment}`,
      'get-user-schedule/index.handler'
    );

    const getUserProfileLambda = createLambdaFunction(
      'GetUserProfileFunction',
      `pickle-play-dates-get-user-profile-${environment}`,
      'get-user-profile/index.handler'
    );

    const updateUserProfileLambda = createLambdaFunction(
      'UpdateUserProfileFunction',
      `pickle-play-dates-update-user-profile-${environment}`,
      'update-user-profile/index.handler'
    );

    const initializeUserProfileLambda = createLambdaFunction(
      'InitializeUserProfileFunction',
      `pickle-play-dates-initialize-user-profile-${environment}`,
      'initialize-user-profile/index.handler'
    );

    const notificationLambda = createLambdaFunction(
      'NotificationFunction',
      `pickle-play-dates-notifications-${environment}`,
      'notifications/index.handler'
    );

    // DynamoDB Stream Event Source
    notificationLambda.addEventSource(
      new DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    // Court Management Lambdas
    const createCourtLambda = createLambdaFunction(
      'CreateCourtFunction',
      `pickle-play-dates-create-court-${environment}`,
      'create-court/index.handler'
    );

    const searchCourtsLambda = createLambdaFunction(
      'SearchCourtsFunction',
      `pickle-play-dates-search-courts-${environment}`,
      'search-courts/index.handler'
    );

    const adminManageCourtsLambda = createLambdaFunction(
      'AdminManageCourtsFunction',
      `pickle-play-dates-admin-manage-courts-${environment}`,
      'admin-manage-courts/index.handler'
    );

    // Simple Lambda integration - let Lambda handle CORS headers
    const createLambdaIntegration = (lambdaFunction: lambda.Function) => {
      return new apigateway.LambdaIntegration(lambdaFunction, {
        proxy: true,
      });
    };

    // API Gateway Routes
    const gamesResource = api.root.addResource('games');
    gamesResource.addMethod('GET', createLambdaIntegration(getAvailableGamesLambda), {
      authorizer: cognitoAuthorizer,
    });
    gamesResource.addMethod('POST', createLambdaIntegration(createGameLambda), {
      authorizer: cognitoAuthorizer,
    });

    const gameResource = gamesResource.addResource('{gameId}');
    gameResource.addMethod('GET', createLambdaIntegration(getGameLambda));
    gameResource.addMethod('PUT', createLambdaIntegration(updateGameLambda), {
      authorizer: cognitoAuthorizer,
    });
    gameResource.addMethod('DELETE', createLambdaIntegration(cancelGameLambda), {
      authorizer: cognitoAuthorizer,
    });

    const joinResource = gameResource.addResource('join');
    joinResource.addMethod('POST', createLambdaIntegration(joinGameLambda), {
      authorizer: cognitoAuthorizer,
    });

    const leaveResource = gameResource.addResource('leave');
    leaveResource.addMethod('POST', createLambdaIntegration(leaveGameLambda), {
      authorizer: cognitoAuthorizer,
    });

    const playersResource = gameResource.addResource('players');
    const playerResource = playersResource.addResource('{userId}');
    playerResource.addMethod('DELETE', createLambdaIntegration(kickPlayerLambda), {
      authorizer: cognitoAuthorizer,
    });

    const usersResource = api.root.addResource('users');
    const meResource = usersResource.addResource('me');
    meResource.addMethod('GET', createLambdaIntegration(getUserProfileLambda), {
      authorizer: cognitoAuthorizer,
    });
    meResource.addMethod('PUT', createLambdaIntegration(updateUserProfileLambda), {
      authorizer: cognitoAuthorizer,
    });

    const initializeResource = meResource.addResource('initialize');
    initializeResource.addMethod('POST', createLambdaIntegration(initializeUserProfileLambda), {
      authorizer: cognitoAuthorizer,
    });

    const scheduleResource = meResource.addResource('schedule');
    scheduleResource.addMethod('GET', createLambdaIntegration(getUserScheduleLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Court Routes
    const courtsResource = api.root.addResource('courts');
    courtsResource.addMethod('GET', createLambdaIntegration(searchCourtsLambda));
    courtsResource.addMethod('POST', createLambdaIntegration(createCourtLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Admin Court Management Routes
    const adminResource = api.root.addResource('admin');
    const adminCourtsResource = adminResource.addResource('courts');
    adminCourtsResource.addMethod('GET', createLambdaIntegration(adminManageCourtsLambda), {
      authorizer: cognitoAuthorizer,
    });

    const adminCourtResource = adminCourtsResource.addResource('{courtId}');
    adminCourtResource.addMethod('PUT', createLambdaIntegration(adminManageCourtsLambda), {
      authorizer: cognitoAuthorizer,
    });
    adminCourtResource.addMethod('DELETE', createLambdaIntegration(adminManageCourtsLambda), {
      authorizer: cognitoAuthorizer,
    });

    // Budget Alert
    new budgets.CfnBudget(this, 'CostBudget', {
      budget: {
        budgetName: `pickle-play-dates-budget-${environment}`,
        budgetLimit: {
          amount: 20,
          unit: 'USD',
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: 'admin@example.com', // Replace with actual admin email
            },
          ],
        },
      ],
    });

    // CloudWatch Alarms
    const errorAlarm = api.metricServerError().createAlarm(this, 'APIErrorAlarm', {
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Output important values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'UserPoolDomainName', {
      value: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
    });

    new cdk.CfnOutput(this, 'APIGatewayURL', {
      value: api.url,
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket for website hosting',
    });
  }
} 