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
        // Helper function to create Lambda without deprecated logRetention
        const createLambdaFunction = (id, functionName, handler) => {
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
        const createGameLambda = createLambdaFunction('CreateGameFunction', `pickle-play-dates-create-game-${environment}`, 'create-game/index.handler');
        const getGameLambda = createLambdaFunction('GetGameFunction', `pickle-play-dates-get-game-${environment}`, 'get-game/index.handler');
        const getAvailableGamesLambda = createLambdaFunction('GetAvailableGamesFunction', `pickle-play-dates-get-available-games-${environment}`, 'get-available-games/index.handler');
        const joinGameLambda = createLambdaFunction('JoinGameFunction', `pickle-play-dates-join-game-${environment}`, 'join-game/index.handler');
        const leaveGameLambda = createLambdaFunction('LeaveGameFunction', `pickle-play-dates-leave-game-${environment}`, 'leave-game/index.handler');
        const updateGameLambda = createLambdaFunction('UpdateGameFunction', `pickle-play-dates-update-game-${environment}`, 'update-game/index.handler');
        const cancelGameLambda = createLambdaFunction('CancelGameFunction', `pickle-play-dates-cancel-game-${environment}`, 'cancel-game/index.handler');
        const kickPlayerLambda = createLambdaFunction('KickPlayerFunction', `pickle-play-dates-kick-player-${environment}`, 'kick-player/index.handler');
        const getUserScheduleLambda = createLambdaFunction('GetUserScheduleFunction', `pickle-play-dates-get-user-schedule-${environment}`, 'get-user-schedule/index.handler');
        const getUserProfileLambda = createLambdaFunction('GetUserProfileFunction', `pickle-play-dates-get-user-profile-${environment}`, 'get-user-profile/index.handler');
        const updateUserProfileLambda = createLambdaFunction('UpdateUserProfileFunction', `pickle-play-dates-update-user-profile-${environment}`, 'update-user-profile/index.handler');
        const initializeUserProfileLambda = createLambdaFunction('InitializeUserProfileFunction', `pickle-play-dates-initialize-user-profile-${environment}`, 'initialize-user-profile/index.handler');
        const notificationLambda = createLambdaFunction('NotificationFunction', `pickle-play-dates-notifications-${environment}`, 'notifications/index.handler');
        // DynamoDB Stream Event Source
        notificationLambda.addEventSource(new aws_lambda_event_sources_1.DynamoEventSource(table, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
        }));
        // Court Management Lambdas
        const createCourtLambda = createLambdaFunction('CreateCourtFunction', `pickle-play-dates-create-court-${environment}`, 'create-court/index.handler');
        const searchCourtsLambda = createLambdaFunction('SearchCourtsFunction', `pickle-play-dates-search-courts-${environment}`, 'search-courts/index.handler');
        const adminManageCourtsLambda = createLambdaFunction('AdminManageCourtsFunction', `pickle-play-dates-admin-manage-courts-${environment}`, 'admin-manage-courts/index.handler');
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
exports.PicklePlayDatesStack = PicklePlayDatesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja2xlLXBsYXktZGF0ZXMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaWNrbGUtcGxheS1kYXRlcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUUzQyxtREFBbUQ7QUFDbkQsMkNBQTJDO0FBQzNDLDJDQUEyQztBQUMzQyx5REFBeUQ7QUFDekQsbUZBQXlFO0FBT3pFLE1BQWEsb0JBQXFCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLDBDQUEwQztRQUMxQyxNQUFNLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzdELFNBQVMsRUFBRSxxQkFBcUIsV0FBVyxFQUFFO1lBQzdDLFlBQVksRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQ2pFLE9BQU8sRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQzVELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsTUFBTSxFQUFFLFFBQVEsQ0FBQyxjQUFjLENBQUMsa0JBQWtCO1lBQ2xELGFBQWEsRUFBRSxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFB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QUFFLFlBQVksQ0FBQyxjQUFjO1lBQ2xDLFdBQVcsRUFBRSw0QkFBNEI7U0FDMUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLGFBQWEsQ0FBQyxVQUFVO1lBQy9CLFdBQVcsRUFBRSwrQkFBK0I7U0FDN0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbmtCRCxvREFta0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgYnVkZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYnVkZ2V0cyc7XG5pbXBvcnQgKiBhcyBzZXMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNlcyc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCB7IER5bmFtb0V2ZW50U291cmNlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ldmVudC1zb3VyY2VzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBpY2tsZVBsYXlEYXRlc1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBQaWNrbGVQbGF5RGF0ZXNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaWNrbGVQbGF5RGF0ZXNTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50IH0gPSBwcm9wcztcblxuICAgIC8vIER5bmFtb0RCIFRhYmxlIHdpdGggc2luZ2xlLXRhYmxlIGRlc2lnblxuICAgIGNvbnN0IHRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdQaWNrbGVQbGF5RGF0ZXNUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAncGsnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnc2snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHN0cmVhbTogZHluYW1vZGIuU3RyZWFtVmlld1R5cGUuTkVXX0FORF9PTERfSU1BR0VTLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgIH0pO1xuXG4gICAgLy8gR1NJIGZvciBnYW1lcyBieSB1c2VyIChmdXR1cmUpXG4gICAgdGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnZ3NpMScsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2dzaTFwaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdnc2kxc2snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuXG4gICAgLy8gR1NJIGZvciBnYW1lcyBieSB1c2VyIChwYXN0KVxuICAgIHRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ2dzaTInLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdnc2kycGsnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnZ3NpMnNrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICB9KTtcblxuICAgIC8vIFMzIEJ1Y2tldCBmb3Igc3RhdGljIGhvc3RpbmdcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnV2Vic2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy13ZWItJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgIH0pO1xuXG4gICAgLy8gT3JpZ2luIEFjY2VzcyBDb250cm9sIGZvciBDbG91ZEZyb250XG4gICAgY29uc3Qgb3JpZ2luQWNjZXNzQ29udHJvbCA9IG5ldyBjbG91ZGZyb250LlMzT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLCAnT0FDJywge1xuICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbE5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1vYWMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdPQUMgZm9yIFBpY2tsZSBQbGF5IERhdGVzIHdlYnNpdGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb25cbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Rpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2wod2Vic2l0ZUJ1Y2tldCwge1xuICAgICAgICAgIG9yaWdpbkFjY2Vzc0NvbnRyb2wsXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBVcGRhdGUgYnVja2V0IHBvbGljeSBmb3IgT0FDXG4gICAgd2Vic2l0ZUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBzaWQ6ICdBbGxvd0Nsb3VkRnJvbnRTZXJ2aWNlUHJpbmNpcGFsUmVhZE9ubHknLFxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2Nsb3VkZnJvbnQuYW1hem9uYXdzLmNvbScpXSxcbiAgICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbd2Vic2l0ZUJ1Y2tldC5hcm5Gb3JPYmplY3RzKCcqJyldLFxuICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7dGhpcy5hY2NvdW50fTpkaXN0cmlidXRpb24vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWR9YCxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQ29nbml0byBVc2VyIFBvb2xcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxuICAgICAgc2lnbkluQWxpYXNlczogeyBlbWFpbDogdHJ1ZSB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxuICAgICAgICByZXF1aXJlRGlnaXRzOiB0cnVlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIFBvb2wgR3JvdXBzXG4gICAgbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCAnT3JnYW5pc2VyR3JvdXAnLCB7XG4gICAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZ3JvdXBOYW1lOiAnb3JnYW5pc2VyJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlcnMgd2hvIGNhbiBvcmdhbml6ZSBnYW1lcycsXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsICdBZG1pbkdyb3VwJywge1xuICAgICAgdXNlclBvb2xJZDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGdyb3VwTmFtZTogJ2FkbWluJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWRtaW5pc3RyYXRpdmUgdXNlcnMnLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciBQb29sIENsaWVudFxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ1VzZXJQb29sQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1jbGllbnQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxuICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIHVzZXJQYXNzd29yZDogZmFsc2UsXG4gICAgICB9LFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtjb2duaXRvLk9BdXRoU2NvcGUuRU1BSUwsIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsIGNvZ25pdG8uT0F1dGhTY29wZS5QUk9GSUxFXSxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkdPT0dMRSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIERvbWFpblxuICAgIGNvbnN0IHVzZXJQb29sRG9tYWluID0gbmV3IGNvZ25pdG8uVXNlclBvb2xEb21haW4odGhpcywgJ1VzZXJQb29sRG9tYWluJywge1xuICAgICAgdXNlclBvb2wsXG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYHBpY2tsZS1wbGF5LWRhdGVzLSR7ZW52aXJvbm1lbnR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gR29vZ2xlIElkZW50aXR5IFByb3ZpZGVyIChvbmx5IGNyZWF0ZWQgaWYgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBwcm92aWRlZClcbiAgICBjb25zdCBnb29nbGVDbGllbnRJZCA9IHByb2Nlc3MuZW52LkdPT0dMRV9DTElFTlRfSUQ7XG4gICAgY29uc3QgZ29vZ2xlQ2xpZW50U2VjcmV0ID0gcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9TRUNSRVQ7XG4gICAgXG4gICAgaWYgKGdvb2dsZUNsaWVudElkICYmIGdvb2dsZUNsaWVudFNlY3JldCkge1xuICAgICAgbmV3IGNvZ25pdG8uVXNlclBvb2xJZGVudGl0eVByb3ZpZGVyR29vZ2xlKHRoaXMsICdHb29nbGVQcm92aWRlcicsIHtcbiAgICAgICAgdXNlclBvb2wsXG4gICAgICAgIGNsaWVudElkOiBnb29nbGVDbGllbnRJZCxcbiAgICAgICAgY2xpZW50U2VjcmV0OiBnb29nbGVDbGllbnRTZWNyZXQsXG4gICAgICAgIHNjb3BlczogWydlbWFpbCcsICdwcm9maWxlJ10sXG4gICAgICAgIGF0dHJpYnV0ZU1hcHBpbmc6IHtcbiAgICAgICAgICBlbWFpbDogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRU1BSUwsXG4gICAgICAgICAgZ2l2ZW5OYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9HSVZFTl9OQU1FLFxuICAgICAgICAgIGZhbWlseU5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0ZBTUlMWV9OQU1FLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SQIEdvb2dsZSBPQXV0aCBjcmVkZW50aWFscyBub3QgZm91bmQgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzLiBTa2lwcGluZyBHb29nbGUgcHJvdmlkZXIuJyk7XG4gICAgfVxuXG4gICAgLy8gQXBwbGUgSWRlbnRpdHkgUHJvdmlkZXIgLSBUZW1wb3JhcmlseSByZW1vdmVkXG4gICAgLy8gVG8gYWRkIEFwcGxlIFNpZ24tSW4gbGF0ZXI6XG4gICAgLy8gMS4gRm9sbG93IHRoZSBzZXR1cCBndWlkZSBpbiBPQVVUSF9TRVRVUC5tZFxuICAgIC8vIDIuIEFkZCBBcHBsZSBjcmVkZW50aWFscyB0byAuZW52XG4gICAgLy8gMy4gVW5jb21tZW50IHRoZSBBcHBsZSBwcm92aWRlciBjb2RlXG4gICAgY29uc29sZS5sb2coJ/CfjY4gQXBwbGUgU2lnbi1JbiBpcyBkaXNhYmxlZC4gRW5hYmxlIGl0IGxhdGVyIGJ5IGZvbGxvd2luZyBPQVVUSF9TRVRVUC5tZCcpO1xuXG4gICAgLy8gU0VTIENvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBzZXNDb25maWd1cmF0aW9uU2V0ID0gbmV3IHNlcy5Db25maWd1cmF0aW9uU2V0KHRoaXMsICdTRVNDb25maWd1cmF0aW9uU2V0Jywge1xuICAgICAgY29uZmlndXJhdGlvblNldE5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBTTlMgVG9waWMgZm9yIG5vdGlmaWNhdGlvbnNcbiAgICBjb25zdCBub3RpZmljYXRpb25Ub3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ05vdGlmaWNhdGlvblRvcGljJywge1xuICAgICAgdG9waWNOYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtbm90aWZpY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgRXhlY3V0aW9uIFJvbGVcbiAgICBjb25zdCBsYW1iZGFFeGVjdXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdMYW1iZGFFeGVjdXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQVdTWFJheURhZW1vbldyaXRlQWNjZXNzJyksXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgRHluYW1vREJBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICB0YWJsZS50YWJsZUFybixcbiAgICAgICAgICAgICAgICBgJHt0YWJsZS50YWJsZUFybn0vaW5kZXgvKmAsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgICAgU0VTQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogWydzZXM6U2VuZEVtYWlsJywgJ3NlczpTZW5kUmF3RW1haWwnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTTlNBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW25vdGlmaWNhdGlvblRvcGljLnRvcGljQXJuXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnUGlja2xlUGxheURhdGVzQVBJJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1hcGktJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgZm9yIFBpY2tsZSBQbGF5IERhdGVzIGFwcGxpY2F0aW9uJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IFsnaHR0cHM6Ly9kMXczeHpvYjByM3kwZi5jbG91ZGZyb250Lm5ldCcsICdodHRwOi8vbG9jYWxob3N0OjMwMDAnXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJywgJ1BVVCcsICdERUxFVEUnLCAnT1BUSU9OUyddLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IFsnQ29udGVudC1UeXBlJywgJ1gtQW16LURhdGUnLCAnQXV0aG9yaXphdGlvbicsICdYLUFwaS1LZXknLCAnWC1BbXotU2VjdXJpdHktVG9rZW4nXSxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBkZXBsb3lPcHRpb25zOiB7XG4gICAgICAgIHN0YWdlTmFtZTogZW52aXJvbm1lbnQsXG4gICAgICAgIHRyYWNpbmdFbmFibGVkOiB0cnVlLFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLklORk8sXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gQXV0aG9yaXplciAgXG4gICAgY29uc3QgY29nbml0b0F1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcih0aGlzLCAnQ29nbml0b0F1dGhvcml6ZXInLCB7XG4gICAgICBjb2duaXRvVXNlclBvb2xzOiBbdXNlclBvb2xdLFxuICAgICAgYXV0aG9yaXplck5hbWU6ICdDb2duaXRvQXV0aG9yaXplcicsXG4gICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLCAvLyBEaXNhYmxlIGNhY2hpbmcgdG8gYXZvaWQgQ09SUyBpc3N1ZXNcbiAgICB9KTtcblxuICAgIC8vIEFkZCBHYXRld2F5IFJlc3BvbnNlcyBmb3IgQ09SUyBvbiBhdXRob3JpemF0aW9uIGZhaWx1cmVzXG4gICAgYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgndW5hdXRob3JpemVkJywge1xuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuVU5BVVRIT1JJWkVELFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIidodHRwczovL2QxdzN4em9iMHIzeTBmLmNsb3VkZnJvbnQubmV0J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogXCIndHJ1ZSdcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdmb3JiaWRkZW4nLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5BQ0NFU1NfREVOSUVELFxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiBcIidodHRwczovL2QxdzN4em9iMHIzeTBmLmNsb3VkZnJvbnQubmV0J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5J1wiLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUNyZWRlbnRpYWxzJzogXCIndHJ1ZSdcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKCdiYWQtcmVxdWVzdC1ib2R5Jywge1xuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuQkFEX1JFUVVFU1RfQk9EWSxcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInaHR0cHM6Ly9kMXczeHpvYjByM3kwZi5jbG91ZGZyb250Lm5ldCdcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiBcIidDb250ZW50LVR5cGUsWC1BbXotRGF0ZSxBdXRob3JpemF0aW9uLFgtQXBpLUtleSdcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIidHRVQsUE9TVCxQVVQsREVMRVRFLE9QVElPTlMnXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6IFwiJ3RydWUnXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXBpLmFkZEdhdGV3YXlSZXNwb25zZSgnZGVmYXVsdC01eHgnLCB7XG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5ERUZBVUxUXzVYWCxcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInaHR0cHM6Ly9kMXczeHpvYjByM3kwZi5jbG91ZGZyb250Lm5ldCdcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiBcIidDb250ZW50LVR5cGUsWC1BbXotRGF0ZSxBdXRob3JpemF0aW9uLFgtQXBpLUtleSdcIixcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIidHRVQsUE9TVCxQVVQsREVMRVRFLE9QVElPTlMnXCIsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1DcmVkZW50aWFscyc6IFwiJ3RydWUnXCIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNyZWF0ZSBMYW1iZGEgd2l0aG91dCBkZXByZWNhdGVkIGxvZ1JldGVudGlvblxuICAgIGNvbnN0IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uID0gKGlkOiBzdHJpbmcsIGZ1bmN0aW9uTmFtZTogc3RyaW5nLCBoYW5kbGVyOiBzdHJpbmcpID0+IHtcbiAgICAgIHJldHVybiBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIGlkLCB7XG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgICByb2xlOiBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgIFRBQkxFX05BTUU6IHRhYmxlLnRhYmxlTmFtZSxcbiAgICAgICAgICBTRVNfQ09ORklHVVJBVElPTl9TRVQ6IHNlc0NvbmZpZ3VyYXRpb25TZXQuY29uZmlndXJhdGlvblNldE5hbWUsXG4gICAgICAgICAgU05TX1RPUElDX0FSTjogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50LFxuICAgICAgICB9LFxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICAgIHRyYWNpbmc6IGxhbWJkYS5UcmFjaW5nLkFDVElWRSxcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBmdW5jdGlvbk5hbWUsXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdCcpLFxuICAgICAgICBoYW5kbGVyOiBoYW5kbGVyLFxuICAgICAgICAvLyBOb3RlOiBXZSdyZSBub3Qgc2V0dGluZyBsb2dHcm91cCBvciBsb2dSZXRlbnRpb25cbiAgICAgICAgLy8gTGFtYmRhIHdpbGwgY3JlYXRlIGxvZyBncm91cHMgYXV0b21hdGljYWxseSB3aXRoIGRlZmF1bHQgc2V0dGluZ3NcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBDcmVhdGUgYWxsIExhbWJkYSBmdW5jdGlvbnNcbiAgICBjb25zdCBjcmVhdGVHYW1lTGFtYmRhID0gY3JlYXRlTGFtYmRhRnVuY3Rpb24oXG4gICAgICAnQ3JlYXRlR2FtZUZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1jcmVhdGUtZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnY3JlYXRlLWdhbWUvaW5kZXguaGFuZGxlcidcbiAgICApO1xuXG4gICAgY29uc3QgZ2V0R2FtZUxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0dldEdhbWVGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMtZ2V0LWdhbWUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgJ2dldC1nYW1lL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IGdldEF2YWlsYWJsZUdhbWVzTGFtYmRhID0gY3JlYXRlTGFtYmRhRnVuY3Rpb24oXG4gICAgICAnR2V0QXZhaWxhYmxlR2FtZXNGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMtZ2V0LWF2YWlsYWJsZS1nYW1lcy0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnZ2V0LWF2YWlsYWJsZS1nYW1lcy9pbmRleC5oYW5kbGVyJ1xuICAgICk7XG5cbiAgICBjb25zdCBqb2luR2FtZUxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0pvaW5HYW1lRnVuY3Rpb24nLFxuICAgICAgYHBpY2tsZS1wbGF5LWRhdGVzLWpvaW4tZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnam9pbi1nYW1lL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IGxlYXZlR2FtZUxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0xlYXZlR2FtZUZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1sZWF2ZS1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICdsZWF2ZS1nYW1lL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IHVwZGF0ZUdhbWVMYW1iZGEgPSBjcmVhdGVMYW1iZGFGdW5jdGlvbihcbiAgICAgICdVcGRhdGVHYW1lRnVuY3Rpb24nLFxuICAgICAgYHBpY2tsZS1wbGF5LWRhdGVzLXVwZGF0ZS1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICd1cGRhdGUtZ2FtZS9pbmRleC5oYW5kbGVyJ1xuICAgICk7XG5cbiAgICBjb25zdCBjYW5jZWxHYW1lTGFtYmRhID0gY3JlYXRlTGFtYmRhRnVuY3Rpb24oXG4gICAgICAnQ2FuY2VsR2FtZUZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1jYW5jZWwtZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnY2FuY2VsLWdhbWUvaW5kZXguaGFuZGxlcidcbiAgICApO1xuXG4gICAgY29uc3Qga2lja1BsYXllckxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0tpY2tQbGF5ZXJGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMta2ljay1wbGF5ZXItJHtlbnZpcm9ubWVudH1gLFxuICAgICAgJ2tpY2stcGxheWVyL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IGdldFVzZXJTY2hlZHVsZUxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0dldFVzZXJTY2hlZHVsZUZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1nZXQtdXNlci1zY2hlZHVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnZ2V0LXVzZXItc2NoZWR1bGUvaW5kZXguaGFuZGxlcidcbiAgICApO1xuXG4gICAgY29uc3QgZ2V0VXNlclByb2ZpbGVMYW1iZGEgPSBjcmVhdGVMYW1iZGFGdW5jdGlvbihcbiAgICAgICdHZXRVc2VyUHJvZmlsZUZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1nZXQtdXNlci1wcm9maWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICdnZXQtdXNlci1wcm9maWxlL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IHVwZGF0ZVVzZXJQcm9maWxlTGFtYmRhID0gY3JlYXRlTGFtYmRhRnVuY3Rpb24oXG4gICAgICAnVXBkYXRlVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMtdXBkYXRlLXVzZXItcHJvZmlsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICAndXBkYXRlLXVzZXItcHJvZmlsZS9pbmRleC5oYW5kbGVyJ1xuICAgICk7XG5cbiAgICBjb25zdCBpbml0aWFsaXplVXNlclByb2ZpbGVMYW1iZGEgPSBjcmVhdGVMYW1iZGFGdW5jdGlvbihcbiAgICAgICdJbml0aWFsaXplVXNlclByb2ZpbGVGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMtaW5pdGlhbGl6ZS11c2VyLXByb2ZpbGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgJ2luaXRpYWxpemUtdXNlci1wcm9maWxlL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbkxhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ05vdGlmaWNhdGlvbkZ1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICdub3RpZmljYXRpb25zL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIC8vIER5bmFtb0RCIFN0cmVhbSBFdmVudCBTb3VyY2VcbiAgICBub3RpZmljYXRpb25MYW1iZGEuYWRkRXZlbnRTb3VyY2UoXG4gICAgICBuZXcgRHluYW1vRXZlbnRTb3VyY2UodGFibGUsIHtcbiAgICAgICAgc3RhcnRpbmdQb3NpdGlvbjogbGFtYmRhLlN0YXJ0aW5nUG9zaXRpb24uTEFURVNULFxuICAgICAgICBiYXRjaFNpemU6IDEwLFxuICAgICAgICBtYXhCYXRjaGluZ1dpbmRvdzogY2RrLkR1cmF0aW9uLnNlY29uZHMoNSksXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDb3VydCBNYW5hZ2VtZW50IExhbWJkYXNcbiAgICBjb25zdCBjcmVhdGVDb3VydExhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ0NyZWF0ZUNvdXJ0RnVuY3Rpb24nLFxuICAgICAgYHBpY2tsZS1wbGF5LWRhdGVzLWNyZWF0ZS1jb3VydC0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnY3JlYXRlLWNvdXJ0L2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IHNlYXJjaENvdXJ0c0xhbWJkYSA9IGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICAgICAgJ1NlYXJjaENvdXJ0c0Z1bmN0aW9uJyxcbiAgICAgIGBwaWNrbGUtcGxheS1kYXRlcy1zZWFyY2gtY291cnRzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICdzZWFyY2gtY291cnRzL2luZGV4LmhhbmRsZXInXG4gICAgKTtcblxuICAgIGNvbnN0IGFkbWluTWFuYWdlQ291cnRzTGFtYmRhID0gY3JlYXRlTGFtYmRhRnVuY3Rpb24oXG4gICAgICAnQWRtaW5NYW5hZ2VDb3VydHNGdW5jdGlvbicsXG4gICAgICBgcGlja2xlLXBsYXktZGF0ZXMtYWRtaW4tbWFuYWdlLWNvdXJ0cy0ke2Vudmlyb25tZW50fWAsXG4gICAgICAnYWRtaW4tbWFuYWdlLWNvdXJ0cy9pbmRleC5oYW5kbGVyJ1xuICAgICk7XG5cbiAgICAvLyBTaW1wbGUgTGFtYmRhIGludGVncmF0aW9uIC0gbGV0IExhbWJkYSBoYW5kbGUgQ09SUyBoZWFkZXJzXG4gICAgY29uc3QgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24gPSAobGFtYmRhRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbikgPT4ge1xuICAgICAgcmV0dXJuIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxhbWJkYUZ1bmN0aW9uLCB7XG4gICAgICAgIHByb3h5OiB0cnVlLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIC8vIEFQSSBHYXRld2F5IFJvdXRlc1xuICAgIGNvbnN0IGdhbWVzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2FtZXMnKTtcbiAgICBnYW1lc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oZ2V0QXZhaWxhYmxlR2FtZXNMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcbiAgICBnYW1lc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGNyZWF0ZUdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGdhbWVSZXNvdXJjZSA9IGdhbWVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tnYW1lSWR9Jyk7XG4gICAgZ2FtZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oZ2V0R2FtZUxhbWJkYSkpO1xuICAgIGdhbWVSZXNvdXJjZS5hZGRNZXRob2QoJ1BVVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKHVwZGF0ZUdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcbiAgICBnYW1lUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihjYW5jZWxHYW1lTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBqb2luUmVzb3VyY2UgPSBnYW1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2pvaW4nKTtcbiAgICBqb2luUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oam9pbkdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGxlYXZlUmVzb3VyY2UgPSBnYW1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2xlYXZlJyk7XG4gICAgbGVhdmVSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihsZWF2ZUdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IHBsYXllcnNSZXNvdXJjZSA9IGdhbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgncGxheWVycycpO1xuICAgIGNvbnN0IHBsYXllclJlc291cmNlID0gcGxheWVyc1Jlc291cmNlLmFkZFJlc291cmNlKCd7dXNlcklkfScpO1xuICAgIHBsYXllclJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oa2lja1BsYXllckxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCd1c2VycycpO1xuICAgIGNvbnN0IG1lUmVzb3VyY2UgPSB1c2Vyc1Jlc291cmNlLmFkZFJlc291cmNlKCdtZScpO1xuICAgIG1lUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihnZXRVc2VyUHJvZmlsZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuICAgIG1lUmVzb3VyY2UuYWRkTWV0aG9kKCdQVVQnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbih1cGRhdGVVc2VyUHJvZmlsZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaW5pdGlhbGl6ZVJlc291cmNlID0gbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgnaW5pdGlhbGl6ZScpO1xuICAgIGluaXRpYWxpemVSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihpbml0aWFsaXplVXNlclByb2ZpbGVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IHNjaGVkdWxlUmVzb3VyY2UgPSBtZVJlc291cmNlLmFkZFJlc291cmNlKCdzY2hlZHVsZScpO1xuICAgIHNjaGVkdWxlUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBjcmVhdGVMYW1iZGFJbnRlZ3JhdGlvbihnZXRVc2VyU2NoZWR1bGVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIENvdXJ0IFJvdXRlc1xuICAgIGNvbnN0IGNvdXJ0c1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2NvdXJ0cycpO1xuICAgIGNvdXJ0c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oc2VhcmNoQ291cnRzTGFtYmRhKSk7XG4gICAgY291cnRzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oY3JlYXRlQ291cnRMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIEFkbWluIENvdXJ0IE1hbmFnZW1lbnQgUm91dGVzXG4gICAgY29uc3QgYWRtaW5SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCdhZG1pbicpO1xuICAgIGNvbnN0IGFkbWluQ291cnRzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCdjb3VydHMnKTtcbiAgICBhZG1pbkNvdXJ0c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oYWRtaW5NYW5hZ2VDb3VydHNMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGFkbWluQ291cnRSZXNvdXJjZSA9IGFkbWluQ291cnRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tjb3VydElkfScpO1xuICAgIGFkbWluQ291cnRSZXNvdXJjZS5hZGRNZXRob2QoJ1BVVCcsIGNyZWF0ZUxhbWJkYUludGVncmF0aW9uKGFkbWluTWFuYWdlQ291cnRzTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG4gICAgYWRtaW5Db3VydFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgY3JlYXRlTGFtYmRhSW50ZWdyYXRpb24oYWRtaW5NYW5hZ2VDb3VydHNMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIC8vIEJ1ZGdldCBBbGVydFxuICAgIG5ldyBidWRnZXRzLkNmbkJ1ZGdldCh0aGlzLCAnQ29zdEJ1ZGdldCcsIHtcbiAgICAgIGJ1ZGdldDoge1xuICAgICAgICBidWRnZXROYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtYnVkZ2V0LSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgYnVkZ2V0TGltaXQ6IHtcbiAgICAgICAgICBhbW91bnQ6IDIwLFxuICAgICAgICAgIHVuaXQ6ICdVU0QnLFxuICAgICAgICB9LFxuICAgICAgICB0aW1lVW5pdDogJ01PTlRITFknLFxuICAgICAgICBidWRnZXRUeXBlOiAnQ09TVCcsXG4gICAgICB9LFxuICAgICAgbm90aWZpY2F0aW9uc1dpdGhTdWJzY3JpYmVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgbm90aWZpY2F0aW9uOiB7XG4gICAgICAgICAgICBub3RpZmljYXRpb25UeXBlOiAnQUNUVUFMJyxcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDgwLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uVHlwZTogJ0VNQUlMJyxcbiAgICAgICAgICAgICAgYWRkcmVzczogJ2FkbWluQGV4YW1wbGUuY29tJywgLy8gUmVwbGFjZSB3aXRoIGFjdHVhbCBhZG1pbiBlbWFpbFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm1zXG4gICAgY29uc3QgZXJyb3JBbGFybSA9IGFwaS5tZXRyaWNTZXJ2ZXJFcnJvcigpLmNyZWF0ZUFsYXJtKHRoaXMsICdBUElFcnJvckFsYXJtJywge1xuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgdmFsdWVzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpbk5hbWUnLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2xEb21haW4uZG9tYWluTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBUElHYXRld2F5VVJMJywge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udFVSTCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udERpc3RyaWJ1dGlvbklkJywge1xuICAgICAgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1MzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB3ZWJzaXRlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIEJ1Y2tldCBmb3Igd2Vic2l0ZSBob3N0aW5nJyxcbiAgICB9KTtcbiAgfVxufSAiXX0=