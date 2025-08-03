"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PicklePlayDatesStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const cognito = require("aws-cdk-lib/aws-cognito");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const budgets = require("aws-cdk-lib/aws-budgets");
const ses = require("aws-cdk-lib/aws-ses");
const sns = require("aws-cdk-lib/aws-sns");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const aws_lambda_event_sources_1 = require("aws-cdk-lib/aws-lambda-event-sources");
class PicklePlayDatesStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
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
        }));
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
        }
        else {
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
                allowOrigins: ['https://d1w3xzob0r3y0f.cloudfront.net', 'http://localhost:3000'],
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
                'Access-Control-Allow-Origin': "'https://d1w3xzob0r3y0f.cloudfront.net'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
        api.addGatewayResponse('forbidden', {
            type: apigateway.ResponseType.ACCESS_DENIED,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'https://d1w3xzob0r3y0f.cloudfront.net'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
        api.addGatewayResponse('bad-request-body', {
            type: apigateway.ResponseType.BAD_REQUEST_BODY,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'https://d1w3xzob0r3y0f.cloudfront.net'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
        api.addGatewayResponse('default-5xx', {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                'Access-Control-Allow-Origin': "'https://d1w3xzob0r3y0f.cloudfront.net'",
                'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'",
                'Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'",
                'Access-Control-Allow-Credentials': "'true'",
            },
        });
        // Lambda functions will be created in separate files
        const lambdaProps = {
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
            logRetention: logs.RetentionDays.ONE_WEEK,
        };
        // Create Games Lambda
        const createGameLambda = new lambda.Function(this, 'CreateGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-create-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'create-game/index.handler',
        });
        // Get Game Lambda
        const getGameLambda = new lambda.Function(this, 'GetGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'get-game/index.handler',
        });
        // Get Available Games Lambda
        const getAvailableGamesLambda = new lambda.Function(this, 'GetAvailableGamesFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-available-games-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'get-available-games/index.handler',
        });
        // Join Game Lambda
        const joinGameLambda = new lambda.Function(this, 'JoinGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-join-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'join-game/index.handler',
        });
        // Leave Game Lambda
        const leaveGameLambda = new lambda.Function(this, 'LeaveGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-leave-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'leave-game/index.handler',
        });
        // Update Game Lambda
        const updateGameLambda = new lambda.Function(this, 'UpdateGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-update-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'update-game/index.handler',
        });
        // Cancel Game Lambda
        const cancelGameLambda = new lambda.Function(this, 'CancelGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-cancel-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'cancel-game/index.handler',
        });
        // Kick Player Lambda
        const kickPlayerLambda = new lambda.Function(this, 'KickPlayerFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-kick-player-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'kick-player/index.handler',
        });
        // Get User Schedule Lambda
        const getUserScheduleLambda = new lambda.Function(this, 'GetUserScheduleFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-user-schedule-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'get-user-schedule/index.handler',
        });
        // Get User Profile Lambda
        const getUserProfileLambda = new lambda.Function(this, 'GetUserProfileFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-user-profile-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'get-user-profile/index.handler',
        });
        // Update User Profile Lambda
        const updateUserProfileLambda = new lambda.Function(this, 'UpdateUserProfileFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-update-user-profile-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'update-user-profile/index.handler',
        });
        // Initialize User Profile Lambda
        const initializeUserProfileLambda = new lambda.Function(this, 'InitializeUserProfileFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-initialize-user-profile-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'initialize-user-profile/index.handler',
        });
        // Notification Lambda (for DynamoDB Streams)
        const notificationLambda = new lambda.Function(this, 'NotificationFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-notifications-${environment}`,
            code: lambda.Code.fromAsset('../services/dist'),
            handler: 'notifications/index.handler',
        });
        // DynamoDB Stream Event Source
        notificationLambda.addEventSource(new aws_lambda_event_sources_1.DynamoEventSource(table, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
        }));
        // Simple Lambda integration - let Lambda handle CORS headers
        const createLambdaIntegration = (lambdaFunction) => {
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
        new cdk.CfnOutput(this, 'S3BucketName', {
            value: websiteBucket.bucketName,
            description: 'S3 Bucket for website hosting',
        });
    }
}
exports.PicklePlayDatesStack = PicklePlayDatesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja2xlLXBsYXktZGF0ZXMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaWNrbGUtcGxheS1kYXRlcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MseURBQXlEO0FBQ3pELG1GQUF5RTtBQU96RSxNQUFhLG9CQUFxQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2pELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBZ0M7UUFDeEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QiwwQ0FBMEM7UUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM3RCxTQUFTLEVBQUUscUJBQXFCLFdBQVcsRUFBRTtZQUM3QyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUM1RCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELE1BQU0sRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLGtCQUFrQjtZQUNsRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMs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UyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDNUMsS0FBSyxFQUFFLGNBQWMsQ0FBQyxVQUFVO1lBQ2hDLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsV0FBVyxZQUFZLENBQUMsc0JBQXNCLEVBQUU7WUFDdkQsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN0QyxLQUFLLEVBQUUsYUFBYSxDQUFDLFVBQVU7WUFDL0IsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF4aUJELG9EQXdpQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBidWRnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1idWRnZXRzJztcbmltcG9ydCAqIGFzIHNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0IHsgRHluYW1vRXZlbnRTb3VyY2UgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGlja2xlUGxheURhdGVzU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFBpY2tsZVBsYXlEYXRlc1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFBpY2tsZVBsYXlEYXRlc1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgd2l0aCBzaW5nbGUtdGFibGUgZGVzaWduXG4gICAgY29uc3QgdGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1BpY2tsZVBsYXlEYXRlc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdwaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBHU0kgZm9yIGdhbWVzIGJ5IHVzZXIgKGZ1dHVyZSlcbiAgICB0YWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdnc2kxJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZ3NpMXBrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2dzaTFzaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHU0kgZm9yIGdhbWVzIGJ5IHVzZXIgKHBhc3QpXG4gICAgdGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnZ3NpMicsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2dzaTJwaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdnc2kyc2snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdGF0aWMgaG9zdGluZ1xuICAgIGNvbnN0IHdlYnNpdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdXZWJzaXRlQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLXdlYi0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBPcmlnaW4gQWNjZXNzIENvbnRyb2wgZm9yIENsb3VkRnJvbnRcbiAgICBjb25zdCBvcmlnaW5BY2Nlc3NDb250cm9sID0gbmV3IGNsb3VkZnJvbnQuUzNPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMsICdPQUMnLCB7XG4gICAgICBvcmlnaW5BY2Nlc3NDb250cm9sTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLW9hYy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ09BQyBmb3IgUGlja2xlIFBsYXkgRGF0ZXMgd2Vic2l0ZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IERpc3RyaWJ1dGlvblxuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh3ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbCxcbiAgICAgICAgfSksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFVwZGF0ZSBidWNrZXQgcG9saWN5IGZvciBPQUNcbiAgICB3ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0FsbG93Q2xvdWRGcm9udFNlcnZpY2VQcmluY2lwYWxSZWFkT25seScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY2xvdWRmcm9udC5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFt3ZWJzaXRlQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdBV1M6U291cmNlQXJuJzogYGFybjphd3M6Y2xvdWRmcm9udDo6JHt0aGlzLmFjY291bnR9OmRpc3RyaWJ1dGlvbi8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH1gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbCBHcm91cHNcbiAgICBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsICdPcmdhbmlzZXJHcm91cCcsIHtcbiAgICAgIHVzZXJQb29sSWQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBncm91cE5hbWU6ICdvcmdhbmlzZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdVc2VycyB3aG8gY2FuIG9yZ2FuaXplIGdhbWVzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjb2duaXRvLkNmblVzZXJQb29sR3JvdXAodGhpcywgJ0FkbWluR3JvdXAnLCB7XG4gICAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZ3JvdXBOYW1lOiAnYWRtaW4nLFxuICAgICAgZGVzY3JpcHRpb246ICdBZG1pbmlzdHJhdGl2ZSB1c2VycycsXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIFBvb2wgQ2xpZW50XG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWNsaWVudC0ke2Vudmlyb25tZW50fWAsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgdXNlclBhc3N3b3JkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIF0sXG4gICAgICAgIGxvZ291dFVybHM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuR09PR0xFLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gRG9tYWluXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHb29nbGUgSWRlbnRpdHkgUHJvdmlkZXIgKG9ubHkgY3JlYXRlZCBpZiBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYXJlIHByb3ZpZGVkKVxuICAgIGNvbnN0IGdvb2dsZUNsaWVudElkID0gcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9JRDtcbiAgICBjb25zdCBnb29nbGVDbGllbnRTZWNyZXQgPSBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVDtcbiAgICBcbiAgICBpZiAoZ29vZ2xlQ2xpZW50SWQgJiYgZ29vZ2xlQ2xpZW50U2VjcmV0KSB7XG4gICAgICBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgICB1c2VyUG9vbCxcbiAgICAgICAgY2xpZW50SWQ6IGdvb2dsZUNsaWVudElkLFxuICAgICAgICBjbGllbnRTZWNyZXQ6IGdvb2dsZUNsaWVudFNlY3JldCxcbiAgICAgICAgc2NvcGVzOiBbJ2VtYWlsJywgJ3Byb2ZpbGUnXSxcbiAgICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgICBnaXZlbk5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0dJVkVOX05BTUUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ/CflJAgR29vZ2xlIE9BdXRoIGNyZWRlbnRpYWxzIG5vdCBmb3VuZCBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIFNraXBwaW5nIEdvb2dsZSBwcm92aWRlci4nKTtcbiAgICB9XG5cbiAgICAvLyBBcHBsZSBJZGVudGl0eSBQcm92aWRlciAtIFRlbXBvcmFyaWx5IHJlbW92ZWRcbiAgICAvLyBUbyBhZGQgQXBwbGUgU2lnbi1JbiBsYXRlcjpcbiAgICAvLyAxLiBGb2xsb3cgdGhlIHNldHVwIGd1aWRlIGluIE9BVVRIX1NFVFVQLm1kXG4gICAgLy8gMi4gQWRkIEFwcGxlIGNyZWRlbnRpYWxzIHRvIC5lbnZcbiAgICAvLyAzLiBVbmNvbW1lbnQgdGhlIEFwcGxlIHByb3ZpZGVyIGNvZGVcbiAgICBjb25zb2xlLmxvZygn8J+NjiBBcHBsZSBTaWduLUluIGlzIGRpc2FibGVkLiBFbmFibGUgaXQgbGF0ZXIgYnkgZm9sbG93aW5nIE9BVVRIX1NFVFVQLm1kJyk7XG5cbiAgICAvLyBTRVMgQ29uZmlndXJhdGlvblxuICAgIGNvbnN0IHNlc0NvbmZpZ3VyYXRpb25TZXQgPSBuZXcgc2VzLkNvbmZpZ3VyYXRpb25TZXQodGhpcywgJ1NFU0NvbmZpZ3VyYXRpb25TZXQnLCB7XG4gICAgICBjb25maWd1cmF0aW9uU2V0TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIFNOUyBUb3BpYyBmb3Igbm90aWZpY2F0aW9uc1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvblRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnTm90aWZpY2F0aW9uVG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBFeGVjdXRpb24gUm9sZVxuICAgIGNvbnN0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBV1NYUmF5RGFlbW9uV3JpdGVBY2Nlc3MnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIGAke3RhYmxlLnRhYmxlQXJufS9pbmRleC8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTRVNBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NlczpTZW5kRW1haWwnLCAnc2VzOlNlbmRSYXdFbWFpbCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIFNOU0FjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdQaWNrbGVQbGF5RGF0ZXNBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgUGlja2xlIFBsYXkgRGF0ZXMgYXBwbGljYXRpb24nLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogWydodHRwczovL2QxdzN4em9iMHIzeTBmLmNsb3VkZnJvbnQubmV0JywgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCddLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFsnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ0RFTEVURScsICdPUFRJT05TJ10sXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnWC1BbXotRGF0ZScsICdBdXRob3JpemF0aW9uJywgJ1gtQXBpLUtleScsICdYLUFtei1TZWN1cml0eS1Ub2tlbiddLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudCxcbiAgICAgICAgdHJhY2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ29nbml0byBBdXRob3JpemVyICBcbiAgICBjb25zdCBjb2duaXRvQXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt1c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ0NvZ25pdG9BdXRob3JpemVyJyxcbiAgICAgIHJlc3VsdHNDYWNoZVR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksIC8vIERpc2FibGUgY2FjaGluZyB0byBhdm9pZCBDT1JTIGlzc3Vlc1xuICAgIH0pO1xuXG4gICAgLy8gQWRkIEdhdGV3YXkgUmVzcG9uc2VzIGZvciBDT1JTIG9uIGF1dGhvcml6YXRpb24gZmFpbHVyZXNcbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCd1bmF1dGhvcml6ZWQnLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5VTkFVVEhPUklaRUQsXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJ2h0dHBzOi8vZDF3M3h6b2IwcjN5MGYuY2xvdWRmcm9udC5uZXQnXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXknXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogXCInR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiBcIid0cnVlJ1wiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ2ZvcmJpZGRlbicsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkFDQ0VTU19ERU5JRUQsXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJ2h0dHBzOi8vZDF3M3h6b2IwcjN5MGYuY2xvdWRmcm9udC5uZXQnXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogXCInQ29udGVudC1UeXBlLFgtQW16LURhdGUsQXV0aG9yaXphdGlvbixYLUFwaS1LZXknXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogXCInR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJ1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctQ3JlZGVudGlhbHMnOiBcIid0cnVlJ1wiLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoJ2JhZC1yZXF1ZXN0LWJvZHknLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5CQURfUkVRVUVTVF9CT0RZLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIidodHRwczovL2QxdzN4em9iMHIzeTBmLmNsb3VkZnJvbnQubmV0J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogXCIndHJ1ZSdcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdkZWZhdWx0LTV4eCcsIHtcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkRFRkFVTFRfNVhYLFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIidodHRwczovL2QxdzN4em9iMHIzeTBmLmNsb3VkZnJvbnQubmV0J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogXCIndHJ1ZSdcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb25zIHdpbGwgYmUgY3JlYXRlZCBpbiBzZXBhcmF0ZSBmaWxlc1xuICAgIGNvbnN0IGxhbWJkYVByb3BzID0ge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogdGFibGUudGFibGVOYW1lLFxuICAgICAgICBTRVNfQ09ORklHVVJBVElPTl9TRVQ6IHNlc0NvbmZpZ3VyYXRpb25TZXQuY29uZmlndXJhdGlvblNldE5hbWUsXG4gICAgICAgIFNOU19UT1BJQ19BUk46IG5vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuLFxuICAgICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgdHJhY2luZzogbGFtYmRhLlRyYWNpbmcuQUNUSVZFLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfTtcblxuICAgIC8vIENyZWF0ZSBHYW1lcyBMYW1iZGFcbiAgICBjb25zdCBjcmVhdGVHYW1lTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ3JlYXRlR2FtZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1jcmVhdGUtZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QnKSxcbiAgICAgIGhhbmRsZXI6ICdjcmVhdGUtZ2FtZS9pbmRleC5oYW5kbGVyJyxcbiAgICB9KTtcblxuICAgIC8vIEdldCBHYW1lIExhbWJkYVxuICAgIGNvbnN0IGdldEdhbWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRHYW1lRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWdldC1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdCcpLFxuICAgICAgaGFuZGxlcjogJ2dldC1nYW1lL2luZGV4LmhhbmRsZXInLFxuICAgIH0pO1xuXG4gICAgLy8gR2V0IEF2YWlsYWJsZSBHYW1lcyBMYW1iZGFcbiAgICBjb25zdCBnZXRBdmFpbGFibGVHYW1lc0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldEF2YWlsYWJsZUdhbWVzRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWdldC1hdmFpbGFibGUtZ2FtZXMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0JyksXG4gICAgICBoYW5kbGVyOiAnZ2V0LWF2YWlsYWJsZS1nYW1lcy9pbmRleC5oYW5kbGVyJyxcbiAgICB9KTtcblxuICAgIC8vIEpvaW4gR2FtZSBMYW1iZGFcbiAgICBjb25zdCBqb2luR2FtZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0pvaW5HYW1lRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWpvaW4tZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QnKSxcbiAgICAgIGhhbmRsZXI6ICdqb2luLWdhbWUvaW5kZXguaGFuZGxlcicsXG4gICAgfSk7XG5cbiAgICAvLyBMZWF2ZSBHYW1lIExhbWJkYVxuICAgIGNvbnN0IGxlYXZlR2FtZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0xlYXZlR2FtZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1sZWF2ZS1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdCcpLFxuICAgICAgaGFuZGxlcjogJ2xlYXZlLWdhbWUvaW5kZXguaGFuZGxlcicsXG4gICAgfSk7XG5cbiAgICAvLyBVcGRhdGUgR2FtZSBMYW1iZGFcbiAgICBjb25zdCB1cGRhdGVHYW1lTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVXBkYXRlR2FtZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy11cGRhdGUtZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QnKSxcbiAgICAgIGhhbmRsZXI6ICd1cGRhdGUtZ2FtZS9pbmRleC5oYW5kbGVyJyxcbiAgICB9KTtcblxuICAgIC8vIENhbmNlbCBHYW1lIExhbWJkYVxuICAgIGNvbnN0IGNhbmNlbEdhbWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDYW5jZWxHYW1lRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWNhbmNlbC1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdCcpLFxuICAgICAgaGFuZGxlcjogJ2NhbmNlbC1nYW1lL2luZGV4LmhhbmRsZXInLFxuICAgIH0pO1xuXG4gICAgLy8gS2ljayBQbGF5ZXIgTGFtYmRhXG4gICAgY29uc3Qga2lja1BsYXllckxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0tpY2tQbGF5ZXJGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMta2ljay1wbGF5ZXItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0JyksXG4gICAgICBoYW5kbGVyOiAna2ljay1wbGF5ZXIvaW5kZXguaGFuZGxlcicsXG4gICAgfSk7XG5cbiAgICAvLyBHZXQgVXNlciBTY2hlZHVsZSBMYW1iZGFcbiAgICBjb25zdCBnZXRVc2VyU2NoZWR1bGVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdHZXRVc2VyU2NoZWR1bGVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtZ2V0LXVzZXItc2NoZWR1bGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0JyksXG4gICAgICBoYW5kbGVyOiAnZ2V0LXVzZXItc2NoZWR1bGUvaW5kZXguaGFuZGxlcicsXG4gICAgfSk7XG5cbiAgICAvLyBHZXQgVXNlciBQcm9maWxlIExhbWJkYVxuICAgIGNvbnN0IGdldFVzZXJQcm9maWxlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnR2V0VXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtZ2V0LXVzZXItcHJvZmlsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QnKSxcbiAgICAgIGhhbmRsZXI6ICdnZXQtdXNlci1wcm9maWxlL2luZGV4LmhhbmRsZXInLFxuICAgIH0pO1xuXG4gICAgLy8gVXBkYXRlIFVzZXIgUHJvZmlsZSBMYW1iZGFcbiAgICBjb25zdCB1cGRhdGVVc2VyUHJvZmlsZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1VwZGF0ZVVzZXJQcm9maWxlRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLXVwZGF0ZS11c2VyLXByb2ZpbGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0JyksXG4gICAgICBoYW5kbGVyOiAndXBkYXRlLXVzZXItcHJvZmlsZS9pbmRleC5oYW5kbGVyJyxcbiAgICB9KTtcblxuICAgIC8vIEluaXRpYWxpemUgVXNlciBQcm9maWxlIExhbWJkYVxuICAgIGNvbnN0IGluaXRpYWxpemVVc2VyUHJvZmlsZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0luaXRpYWxpemVVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1pbml0aWFsaXplLXVzZXItcHJvZmlsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QnKSxcbiAgICAgIGhhbmRsZXI6ICdpbml0aWFsaXplLXVzZXItcHJvZmlsZS9pbmRleC5oYW5kbGVyJyxcbiAgICB9KTtcblxuICAgIC8vIE5vdGlmaWNhdGlvbiBMYW1iZGEgKGZvciBEeW5hbW9EQiBTdHJlYW1zKVxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ05vdGlmaWNhdGlvbkZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdCcpLFxuICAgICAgaGFuZGxlcjogJ25vdGlmaWNhdGlvbnMvaW5kZXguaGFuZGxlcicsXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBTdHJlYW0gRXZlbnQgU291cmNlXG4gICAgbm90aWZpY2F0aW9uTGFtYmRhLmFkZEV2ZW50U291cmNlKFxuICAgICAgbmV3IER5bmFtb0V2ZW50U291cmNlKHRhYmxlLCB7XG4gICAgICAgIHN0YXJ0aW5nUG9zaXRpb246IGxhbWJkYS5TdGFydGluZ1Bvc2l0aW9uLkxBVEVTVCxcbiAgICAgICAgYmF0Y2hTaXplOiAxMCxcbiAgICAgICAgbWF4QmF0Y2hpbmdXaW5kb3c6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDUpLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gU2ltcGxlIExhbWJkYSBpbnRlZ3JhdGlvbiAtIGxldCBMYW1iZGEgaGFuZGxlIENPUlMgaGVhZGVyc1xuICAgIGNvbnN0IGNyZWF0ZUxhbWJkYUludGVncmF0aW9uID0gKGxhbWJkYUZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb24pID0+IHtcbiAgICAgIHJldHVybiBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihsYW1iZGFGdW5jdGlvbiwge1xuICAgICAgICBwcm94eTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBBUEkgR2F0ZXdheSBSb3V0ZXNcbiAgICBjb25zdCBnYW1lc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2dhbWVzJyk7XG4gICAgZ2FtZXNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGdldEF2YWlsYWJsZUdhbWVzTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG4gICAgZ2FtZXNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihjcmVhdGVHYW1lTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBnYW1lUmVzb3VyY2UgPSBnYW1lc1Jlc291cmNlLmFkZFJlc291cmNlKCd7Z2FtZUlkfScpO1xuICAgIGdhbWVSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGdldEdhbWVMYW1iZGEpKTtcbiAgICBnYW1lUmVzb3VyY2UuYWRkTWV0aG9kKCdQVVQnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbih1cGRhdGVHYW1lTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG4gICAgZ2FtZVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oY2FuY2VsR2FtZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgam9pblJlc291cmNlID0gZ2FtZVJlc291cmNlLmFkZFJlc291cmNlKCdqb2luJyk7XG4gICAgam9pblJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGpvaW5HYW1lTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBsZWF2ZVJlc291cmNlID0gZ2FtZVJlc291cmNlLmFkZFJlc291cmNlKCdsZWF2ZScpO1xuICAgIGxlYXZlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24obGVhdmVHYW1lTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwbGF5ZXJzUmVzb3VyY2UgPSBnYW1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3BsYXllcnMnKTtcbiAgICBjb25zdCBwbGF5ZXJSZXNvdXJjZSA9IHBsYXllcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgne3VzZXJJZH0nKTtcbiAgICBwbGF5ZXJSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGtpY2tQbGF5ZXJMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IHVzZXJzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICBjb25zdCBtZVJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbWUnKTtcbiAgICBtZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oZ2V0VXNlclByb2ZpbGVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcbiAgICBtZVJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24odXBkYXRlVXNlclByb2ZpbGVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGluaXRpYWxpemVSZXNvdXJjZSA9IG1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2luaXRpYWxpemUnKTtcbiAgICBpbml0aWFsaXplUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oaW5pdGlhbGl6ZVVzZXJQcm9maWxlTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlZHVsZVJlc291cmNlID0gbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc2NoZWR1bGUnKTtcbiAgICBzY2hlZHVsZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oZ2V0VXNlclNjaGVkdWxlTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICAvLyBCdWRnZXQgQWxlcnRcbiAgICBuZXcgYnVkZ2V0cy5DZm5CdWRnZXQodGhpcywgJ0Nvc3RCdWRnZXQnLCB7XG4gICAgICBidWRnZXQ6IHtcbiAgICAgICAgYnVkZ2V0TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWJ1ZGdldC0ke2Vudmlyb25tZW50fWAsXG4gICAgICAgIGJ1ZGdldExpbWl0OiB7XG4gICAgICAgICAgYW1vdW50OiAyMCxcbiAgICAgICAgICB1bml0OiAnVVNEJyxcbiAgICAgICAgfSxcbiAgICAgICAgdGltZVVuaXQ6ICdNT05USExZJyxcbiAgICAgICAgYnVkZ2V0VHlwZTogJ0NPU1QnLFxuICAgICAgfSxcbiAgICAgIG5vdGlmaWNhdGlvbnNXaXRoU3Vic2NyaWJlcnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIG5vdGlmaWNhdGlvbjoge1xuICAgICAgICAgICAgbm90aWZpY2F0aW9uVHlwZTogJ0FDVFVBTCcsXG4gICAgICAgICAgICBjb21wYXJpc29uT3BlcmF0b3I6ICdHUkVBVEVSX1RIQU4nLFxuICAgICAgICAgICAgdGhyZXNob2xkOiA4MCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHN1YnNjcmliZXJzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvblR5cGU6ICdFTUFJTCcsXG4gICAgICAgICAgICAgIGFkZHJlc3M6ICdhZG1pbkBleGFtcGxlLmNvbScsIC8vIFJlcGxhY2Ugd2l0aCBhY3R1YWwgYWRtaW4gZW1haWxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtc1xuICAgIGNvbnN0IGVycm9yQWxhcm0gPSBhcGkubWV0cmljU2VydmVyRXJyb3IoKS5jcmVhdGVBbGFybSh0aGlzLCAnQVBJRXJyb3JBbGFybScsIHtcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgaW1wb3J0YW50IHZhbHVlc1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbENsaWVudElkJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW5OYW1lJywge1xuICAgICAgdmFsdWU6IHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIERvbWFpbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQVBJR2F0ZXdheVVSTCcsIHtcbiAgICAgIHZhbHVlOiBhcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnRVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1MzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB3ZWJzaXRlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIEJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nJyxcbiAgICB9KTtcbiAgfVxufSAiXX0=