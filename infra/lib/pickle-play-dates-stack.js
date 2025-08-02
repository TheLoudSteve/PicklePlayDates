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
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
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
        });
        // Lambda functions will be created in separate files
        const lambdaProps = {
            runtime: lambda.Runtime.NODEJS_20_X,
            handler: 'index.handler',
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
            code: lambda.Code.fromAsset('../services/dist/create-game'),
        });
        // Get Game Lambda
        const getGameLambda = new lambda.Function(this, 'GetGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/get-game'),
        });
        // Join Game Lambda
        const joinGameLambda = new lambda.Function(this, 'JoinGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-join-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/join-game'),
        });
        // Leave Game Lambda
        const leaveGameLambda = new lambda.Function(this, 'LeaveGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-leave-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/leave-game'),
        });
        // Cancel Game Lambda
        const cancelGameLambda = new lambda.Function(this, 'CancelGameFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-cancel-game-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/cancel-game'),
        });
        // Kick Player Lambda
        const kickPlayerLambda = new lambda.Function(this, 'KickPlayerFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-kick-player-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/kick-player'),
        });
        // Get User Schedule Lambda
        const getUserScheduleLambda = new lambda.Function(this, 'GetUserScheduleFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-get-user-schedule-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/get-user-schedule'),
        });
        // Update User Profile Lambda
        const updateUserProfileLambda = new lambda.Function(this, 'UpdateUserProfileFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-update-user-profile-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/update-user-profile'),
        });
        // Initialize User Profile Lambda
        const initializeUserProfileLambda = new lambda.Function(this, 'InitializeUserProfileFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-initialize-user-profile-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/initialize-user-profile'),
        });
        // Notification Lambda (for DynamoDB Streams)
        const notificationLambda = new lambda.Function(this, 'NotificationFunction', {
            ...lambdaProps,
            functionName: `pickle-play-dates-notifications-${environment}`,
            code: lambda.Code.fromAsset('../services/dist/notifications'),
        });
        // DynamoDB Stream Event Source
        notificationLambda.addEventSource(new aws_lambda_event_sources_1.DynamoEventSource(table, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.seconds(5),
        }));
        // API Gateway Routes
        const gamesResource = api.root.addResource('games');
        gamesResource.addMethod('POST', new apigateway.LambdaIntegration(createGameLambda), {
            authorizer: cognitoAuthorizer,
        });
        const gameResource = gamesResource.addResource('{gameId}');
        gameResource.addMethod('GET', new apigateway.LambdaIntegration(getGameLambda));
        gameResource.addMethod('DELETE', new apigateway.LambdaIntegration(cancelGameLambda), {
            authorizer: cognitoAuthorizer,
        });
        const joinResource = gameResource.addResource('join');
        joinResource.addMethod('POST', new apigateway.LambdaIntegration(joinGameLambda), {
            authorizer: cognitoAuthorizer,
        });
        const leaveResource = gameResource.addResource('leave');
        leaveResource.addMethod('POST', new apigateway.LambdaIntegration(leaveGameLambda), {
            authorizer: cognitoAuthorizer,
        });
        const playersResource = gameResource.addResource('players');
        const playerResource = playersResource.addResource('{userId}');
        playerResource.addMethod('DELETE', new apigateway.LambdaIntegration(kickPlayerLambda), {
            authorizer: cognitoAuthorizer,
        });
        const usersResource = api.root.addResource('users');
        const meResource = usersResource.addResource('me');
        meResource.addMethod('PUT', new apigateway.LambdaIntegration(updateUserProfileLambda), {
            authorizer: cognitoAuthorizer,
        });
        const initializeResource = meResource.addResource('initialize');
        initializeResource.addMethod('POST', new apigateway.LambdaIntegration(initializeUserProfileLambda), {
            authorizer: cognitoAuthorizer,
        });
        const scheduleResource = meResource.addResource('schedule');
        scheduleResource.addMethod('GET', new apigateway.LambdaIntegration(getUserScheduleLambda), {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja2xlLXBsYXktZGF0ZXMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwaWNrbGUtcGxheS1kYXRlcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMscURBQXFEO0FBQ3JELHlDQUF5QztBQUN6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBQzlELG1EQUFtRDtBQUNuRCx5REFBeUQ7QUFDekQsaURBQWlEO0FBQ2pELDJDQUEyQztBQUMzQyw2Q0FBNkM7QUFDN0MsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MseURBQXlEO0FBQ3pELG1GQUF5RTtBQU96RSxNQUFhLG9CQUFxQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2pELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBZ0M7UUFDeEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5QiwwQ0FBMEM7UUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM3RCxTQUFTLEVBQUUscUJBQXFCLFdBQVcsRUFBRTtZQUM3QyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNqRSxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUM1RCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELE1BQU0sRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLGtCQUFrQjtZQUNsRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMs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RCxXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RDLEtBQUssRUFBRSxhQUFhLENBQUMsVUFBVTtZQUMvQixXQUFXLEVBQUUsK0JBQStCO1NBQzdDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQTVjRCxvREE0Y0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBidWRnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1idWRnZXRzJztcbmltcG9ydCAqIGFzIHNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc2VzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0IHsgRHluYW1vRXZlbnRTb3VyY2UgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGlja2xlUGxheURhdGVzU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFBpY2tsZVBsYXlEYXRlc1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFBpY2tsZVBsYXlEYXRlc1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gRHluYW1vREIgVGFibGUgd2l0aCBzaW5nbGUtdGFibGUgZGVzaWduXG4gICAgY29uc3QgdGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1BpY2tsZVBsYXlEYXRlc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IG5hbWU6ICdwaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdzaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBHU0kgZm9yIGdhbWVzIGJ5IHVzZXIgKGZ1dHVyZSlcbiAgICB0YWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdnc2kxJyxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnZ3NpMXBrJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgIHNvcnRLZXk6IHsgbmFtZTogJ2dzaTFzaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHU0kgZm9yIGdhbWVzIGJ5IHVzZXIgKHBhc3QpXG4gICAgdGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnZ3NpMicsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogJ2dzaTJwaycsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6ICdnc2kyc2snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgIH0pO1xuXG4gICAgLy8gUzMgQnVja2V0IGZvciBzdGF0aWMgaG9zdGluZ1xuICAgIGNvbnN0IHdlYnNpdGVCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdXZWJzaXRlQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLXdlYi0ke2Vudmlyb25tZW50fS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgfSk7XG5cbiAgICAvLyBPcmlnaW4gQWNjZXNzIENvbnRyb2wgZm9yIENsb3VkRnJvbnRcbiAgICBjb25zdCBvcmlnaW5BY2Nlc3NDb250cm9sID0gbmV3IGNsb3VkZnJvbnQuUzNPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMsICdPQUMnLCB7XG4gICAgICBvcmlnaW5BY2Nlc3NDb250cm9sTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLW9hYy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ09BQyBmb3IgUGlja2xlIFBsYXkgRGF0ZXMgd2Vic2l0ZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZEZyb250IERpc3RyaWJ1dGlvblxuICAgIGNvbnN0IGRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh3ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbCxcbiAgICAgICAgfSksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIFVwZGF0ZSBidWNrZXQgcG9saWN5IGZvciBPQUNcbiAgICB3ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIHNpZDogJ0FsbG93Q2xvdWRGcm9udFNlcnZpY2VQcmluY2lwYWxSZWFkT25seScsXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY2xvdWRmcm9udC5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgICByZXNvdXJjZXM6IFt3ZWJzaXRlQnVja2V0LmFybkZvck9iamVjdHMoJyonKV0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdBV1M6U291cmNlQXJuJzogYGFybjphd3M6Y2xvdWRmcm9udDo6JHt0aGlzLmFjY291bnR9OmRpc3RyaWJ1dGlvbi8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH1gLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDb2duaXRvIFVzZXIgUG9vbFxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgJ1VzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbCBHcm91cHNcbiAgICBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsICdPcmdhbmlzZXJHcm91cCcsIHtcbiAgICAgIHVzZXJQb29sSWQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBncm91cE5hbWU6ICdvcmdhbmlzZXInLFxuICAgICAgZGVzY3JpcHRpb246ICdVc2VycyB3aG8gY2FuIG9yZ2FuaXplIGdhbWVzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjb2duaXRvLkNmblVzZXJQb29sR3JvdXAodGhpcywgJ0FkbWluR3JvdXAnLCB7XG4gICAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZ3JvdXBOYW1lOiAnYWRtaW4nLFxuICAgICAgZGVzY3JpcHRpb246ICdBZG1pbmlzdHJhdGl2ZSB1c2VycycsXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIFBvb2wgQ2xpZW50XG4gICAgY29uc3QgdXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVXNlclBvb2xDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWNsaWVudC0ke2Vudmlyb25tZW50fWAsXG4gICAgICBnZW5lcmF0ZVNlY3JldDogZmFsc2UsXG4gICAgICBhdXRoRmxvd3M6IHtcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcbiAgICAgICAgdXNlclBhc3N3b3JkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGF1dGhvcml6YXRpb25Db2RlR3JhbnQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHNjb3BlczogW2NvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCwgY29nbml0by5PQXV0aFNjb3BlLk9QRU5JRCwgY29nbml0by5PQXV0aFNjb3BlLlBST0ZJTEVdLFxuICAgICAgICBjYWxsYmFja1VybHM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIF0sXG4gICAgICAgIGxvZ291dFVybHM6IFtcbiAgICAgICAgICBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuR09PR0xFLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENvZ25pdG8gRG9tYWluXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB1c2VyUG9vbCxcbiAgICAgIGNvZ25pdG9Eb21haW46IHtcbiAgICAgICAgZG9tYWluUHJlZml4OiBgcGlja2xlLXBsYXktZGF0ZXMtJHtlbnZpcm9ubWVudH0tJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBHb29nbGUgSWRlbnRpdHkgUHJvdmlkZXIgKG9ubHkgY3JlYXRlZCBpZiBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYXJlIHByb3ZpZGVkKVxuICAgIGNvbnN0IGdvb2dsZUNsaWVudElkID0gcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9JRDtcbiAgICBjb25zdCBnb29nbGVDbGllbnRTZWNyZXQgPSBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVDtcbiAgICBcbiAgICBpZiAoZ29vZ2xlQ2xpZW50SWQgJiYgZ29vZ2xlQ2xpZW50U2VjcmV0KSB7XG4gICAgICBuZXcgY29nbml0by5Vc2VyUG9vbElkZW50aXR5UHJvdmlkZXJHb29nbGUodGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xuICAgICAgICB1c2VyUG9vbCxcbiAgICAgICAgY2xpZW50SWQ6IGdvb2dsZUNsaWVudElkLFxuICAgICAgICBjbGllbnRTZWNyZXQ6IGdvb2dsZUNsaWVudFNlY3JldCxcbiAgICAgICAgc2NvcGVzOiBbJ2VtYWlsJywgJ3Byb2ZpbGUnXSxcbiAgICAgICAgYXR0cmlidXRlTWFwcGluZzoge1xuICAgICAgICAgIGVtYWlsOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9FTUFJTCxcbiAgICAgICAgICBnaXZlbk5hbWU6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0dJVkVOX05BTUUsXG4gICAgICAgICAgZmFtaWx5TmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfRkFNSUxZX05BTUUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coJ/CflJAgR29vZ2xlIE9BdXRoIGNyZWRlbnRpYWxzIG5vdCBmb3VuZCBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIFNraXBwaW5nIEdvb2dsZSBwcm92aWRlci4nKTtcbiAgICB9XG5cbiAgICAvLyBBcHBsZSBJZGVudGl0eSBQcm92aWRlciAtIFRlbXBvcmFyaWx5IHJlbW92ZWRcbiAgICAvLyBUbyBhZGQgQXBwbGUgU2lnbi1JbiBsYXRlcjpcbiAgICAvLyAxLiBGb2xsb3cgdGhlIHNldHVwIGd1aWRlIGluIE9BVVRIX1NFVFVQLm1kXG4gICAgLy8gMi4gQWRkIEFwcGxlIGNyZWRlbnRpYWxzIHRvIC5lbnZcbiAgICAvLyAzLiBVbmNvbW1lbnQgdGhlIEFwcGxlIHByb3ZpZGVyIGNvZGVcbiAgICBjb25zb2xlLmxvZygn8J+NjiBBcHBsZSBTaWduLUluIGlzIGRpc2FibGVkLiBFbmFibGUgaXQgbGF0ZXIgYnkgZm9sbG93aW5nIE9BVVRIX1NFVFVQLm1kJyk7XG5cbiAgICAvLyBTRVMgQ29uZmlndXJhdGlvblxuICAgIGNvbnN0IHNlc0NvbmZpZ3VyYXRpb25TZXQgPSBuZXcgc2VzLkNvbmZpZ3VyYXRpb25TZXQodGhpcywgJ1NFU0NvbmZpZ3VyYXRpb25TZXQnLCB7XG4gICAgICBjb25maWd1cmF0aW9uU2V0TmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIFNOUyBUb3BpYyBmb3Igbm90aWZpY2F0aW9uc1xuICAgIGNvbnN0IG5vdGlmaWNhdGlvblRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnTm90aWZpY2F0aW9uVG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1ub3RpZmljYXRpb25zLSR7ZW52aXJvbm1lbnR9YCxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBFeGVjdXRpb24gUm9sZVxuICAgIGNvbnN0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBV1NYUmF5RGFlbW9uV3JpdGVBY2Nlc3MnKSxcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIHRhYmxlLnRhYmxlQXJuLFxuICAgICAgICAgICAgICAgIGAke3RhYmxlLnRhYmxlQXJufS9pbmRleC8qYCxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgICBTRVNBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ3NlczpTZW5kRW1haWwnLCAnc2VzOlNlbmRSYXdFbWFpbCddLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICAgIFNOU0FjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm5dLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdQaWNrbGVQbGF5RGF0ZXNBUEknLCB7XG4gICAgICByZXN0QXBpTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWFwaS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBmb3IgUGlja2xlIFBsYXkgRGF0ZXMgYXBwbGljYXRpb24nLFxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbJ0NvbnRlbnQtVHlwZScsICdYLUFtei1EYXRlJywgJ0F1dGhvcml6YXRpb24nLCAnWC1BcGktS2V5J10sXG4gICAgICB9LFxuICAgICAgZGVwbG95T3B0aW9uczoge1xuICAgICAgICBzdGFnZU5hbWU6IGVudmlyb25tZW50LFxuICAgICAgICB0cmFjaW5nRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2duaXRvIEF1dGhvcml6ZXJcbiAgICBjb25zdCBjb2duaXRvQXV0aG9yaXplciA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdDb2duaXRvQXV0aG9yaXplcicsIHtcbiAgICAgIGNvZ25pdG9Vc2VyUG9vbHM6IFt1c2VyUG9vbF0sXG4gICAgICBhdXRob3JpemVyTmFtZTogJ0NvZ25pdG9BdXRob3JpemVyJyxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbnMgd2lsbCBiZSBjcmVhdGVkIGluIHNlcGFyYXRlIGZpbGVzXG4gICAgY29uc3QgbGFtYmRhUHJvcHMgPSB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHJvbGU6IGxhbWJkYUV4ZWN1dGlvblJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBUQUJMRV9OQU1FOiB0YWJsZS50YWJsZU5hbWUsXG4gICAgICAgIFNFU19DT05GSUdVUkFUSU9OX1NFVDogc2VzQ29uZmlndXJhdGlvblNldC5jb25maWd1cmF0aW9uU2V0TmFtZSxcbiAgICAgICAgU05TX1RPUElDX0FSTjogbm90aWZpY2F0aW9uVG9waWMudG9waWNBcm4sXG4gICAgICAgIEVOVklST05NRU5UOiBlbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICB0cmFjaW5nOiBsYW1iZGEuVHJhY2luZy5BQ1RJVkUsXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIEdhbWVzIExhbWJkYVxuICAgIGNvbnN0IGNyZWF0ZUdhbWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDcmVhdGVHYW1lRnVuY3Rpb24nLCB7XG4gICAgICAuLi5sYW1iZGFQcm9wcyxcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHBpY2tsZS1wbGF5LWRhdGVzLWNyZWF0ZS1nYW1lLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdC9jcmVhdGUtZ2FtZScpLFxuICAgIH0pO1xuXG4gICAgLy8gR2V0IEdhbWUgTGFtYmRhXG4gICAgY29uc3QgZ2V0R2FtZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldEdhbWVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtZ2V0LWdhbWUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0L2dldC1nYW1lJyksXG4gICAgfSk7XG5cbiAgICAvLyBKb2luIEdhbWUgTGFtYmRhXG4gICAgY29uc3Qgam9pbkdhbWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdKb2luR2FtZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1qb2luLWdhbWUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0L2pvaW4tZ2FtZScpLFxuICAgIH0pO1xuXG4gICAgLy8gTGVhdmUgR2FtZSBMYW1iZGFcbiAgICBjb25zdCBsZWF2ZUdhbWVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdMZWF2ZUdhbWVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtbGVhdmUtZ2FtZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QvbGVhdmUtZ2FtZScpLFxuICAgIH0pO1xuXG4gICAgLy8gQ2FuY2VsIEdhbWUgTGFtYmRhXG4gICAgY29uc3QgY2FuY2VsR2FtZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NhbmNlbEdhbWVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtY2FuY2VsLWdhbWUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0L2NhbmNlbC1nYW1lJyksXG4gICAgfSk7XG5cbiAgICAvLyBLaWNrIFBsYXllciBMYW1iZGFcbiAgICBjb25zdCBraWNrUGxheWVyTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnS2lja1BsYXllckZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1raWNrLXBsYXllci0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3Qva2ljay1wbGF5ZXInKSxcbiAgICB9KTtcblxuICAgIC8vIEdldCBVc2VyIFNjaGVkdWxlIExhbWJkYVxuICAgIGNvbnN0IGdldFVzZXJTY2hlZHVsZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0dldFVzZXJTY2hlZHVsZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1nZXQtdXNlci1zY2hlZHVsZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3QvZ2V0LXVzZXItc2NoZWR1bGUnKSxcbiAgICB9KTtcblxuICAgIC8vIFVwZGF0ZSBVc2VyIFByb2ZpbGUgTGFtYmRhXG4gICAgY29uc3QgdXBkYXRlVXNlclByb2ZpbGVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVcGRhdGVVc2VyUHJvZmlsZUZ1bmN0aW9uJywge1xuICAgICAgLi4ubGFtYmRhUHJvcHMsXG4gICAgICBmdW5jdGlvbk5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy11cGRhdGUtdXNlci1wcm9maWxlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnLi4vc2VydmljZXMvZGlzdC91cGRhdGUtdXNlci1wcm9maWxlJyksXG4gICAgfSk7XG5cbiAgICAvLyBJbml0aWFsaXplIFVzZXIgUHJvZmlsZSBMYW1iZGFcbiAgICBjb25zdCBpbml0aWFsaXplVXNlclByb2ZpbGVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdJbml0aWFsaXplVXNlclByb2ZpbGVGdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtaW5pdGlhbGl6ZS11c2VyLXByb2ZpbGUtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9zZXJ2aWNlcy9kaXN0L2luaXRpYWxpemUtdXNlci1wcm9maWxlJyksXG4gICAgfSk7XG5cbiAgICAvLyBOb3RpZmljYXRpb24gTGFtYmRhIChmb3IgRHluYW1vREIgU3RyZWFtcylcbiAgICBjb25zdCBub3RpZmljYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdOb3RpZmljYXRpb25GdW5jdGlvbicsIHtcbiAgICAgIC4uLmxhbWJkYVByb3BzLFxuICAgICAgZnVuY3Rpb25OYW1lOiBgcGlja2xlLXBsYXktZGF0ZXMtbm90aWZpY2F0aW9ucy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL3NlcnZpY2VzL2Rpc3Qvbm90aWZpY2F0aW9ucycpLFxuICAgIH0pO1xuXG4gICAgLy8gRHluYW1vREIgU3RyZWFtIEV2ZW50IFNvdXJjZVxuICAgIG5vdGlmaWNhdGlvbkxhbWJkYS5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBEeW5hbW9FdmVudFNvdXJjZSh0YWJsZSwge1xuICAgICAgICBzdGFydGluZ1Bvc2l0aW9uOiBsYW1iZGEuU3RhcnRpbmdQb3NpdGlvbi5MQVRFU1QsXG4gICAgICAgIGJhdGNoU2l6ZTogMTAsXG4gICAgICAgIG1heEJhdGNoaW5nV2luZG93OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg1KSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFQSSBHYXRld2F5IFJvdXRlc1xuICAgIGNvbnN0IGdhbWVzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnZ2FtZXMnKTtcbiAgICBnYW1lc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGNyZWF0ZUdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGdhbWVSZXNvdXJjZSA9IGdhbWVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tnYW1lSWR9Jyk7XG4gICAgZ2FtZVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZ2V0R2FtZUxhbWJkYSkpO1xuICAgIGdhbWVSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGNhbmNlbEdhbWVMYW1iZGEpLCB7XG4gICAgICBhdXRob3JpemVyOiBjb2duaXRvQXV0aG9yaXplcixcbiAgICB9KTtcblxuICAgIGNvbnN0IGpvaW5SZXNvdXJjZSA9IGdhbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgnam9pbicpO1xuICAgIGpvaW5SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihqb2luR2FtZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbGVhdmVSZXNvdXJjZSA9IGdhbWVSZXNvdXJjZS5hZGRSZXNvdXJjZSgnbGVhdmUnKTtcbiAgICBsZWF2ZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxlYXZlR2FtZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGxheWVyc1Jlc291cmNlID0gZ2FtZVJlc291cmNlLmFkZFJlc291cmNlKCdwbGF5ZXJzJyk7XG4gICAgY29uc3QgcGxheWVyUmVzb3VyY2UgPSBwbGF5ZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t1c2VySWR9Jyk7XG4gICAgcGxheWVyUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihraWNrUGxheWVyTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCB1c2Vyc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VzZXJzJyk7XG4gICAgY29uc3QgbWVSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ21lJyk7XG4gICAgbWVSZXNvdXJjZS5hZGRNZXRob2QoJ1BVVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVwZGF0ZVVzZXJQcm9maWxlTGFtYmRhKSwge1xuICAgICAgYXV0aG9yaXplcjogY29nbml0b0F1dGhvcml6ZXIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBpbml0aWFsaXplUmVzb3VyY2UgPSBtZVJlc291cmNlLmFkZFJlc291cmNlKCdpbml0aWFsaXplJyk7XG4gICAgaW5pdGlhbGl6ZVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGluaXRpYWxpemVVc2VyUHJvZmlsZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgc2NoZWR1bGVSZXNvdXJjZSA9IG1lUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3NjaGVkdWxlJyk7XG4gICAgc2NoZWR1bGVSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGdldFVzZXJTY2hlZHVsZUxhbWJkYSksIHtcbiAgICAgIGF1dGhvcml6ZXI6IGNvZ25pdG9BdXRob3JpemVyLFxuICAgIH0pO1xuXG4gICAgLy8gQnVkZ2V0IEFsZXJ0XG4gICAgbmV3IGJ1ZGdldHMuQ2ZuQnVkZ2V0KHRoaXMsICdDb3N0QnVkZ2V0Jywge1xuICAgICAgYnVkZ2V0OiB7XG4gICAgICAgIGJ1ZGdldE5hbWU6IGBwaWNrbGUtcGxheS1kYXRlcy1idWRnZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBidWRnZXRMaW1pdDoge1xuICAgICAgICAgIGFtb3VudDogMjAsXG4gICAgICAgICAgdW5pdDogJ1VTRCcsXG4gICAgICAgIH0sXG4gICAgICAgIHRpbWVVbml0OiAnTU9OVEhMWScsXG4gICAgICAgIGJ1ZGdldFR5cGU6ICdDT1NUJyxcbiAgICAgIH0sXG4gICAgICBub3RpZmljYXRpb25zV2l0aFN1YnNjcmliZXJzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcbiAgICAgICAgICAgIG5vdGlmaWNhdGlvblR5cGU6ICdBQ1RVQUwnLFxuICAgICAgICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiAnR1JFQVRFUl9USEFOJyxcbiAgICAgICAgICAgIHRocmVzaG9sZDogODAsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzdWJzY3JpYmVyczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25UeXBlOiAnRU1BSUwnLFxuICAgICAgICAgICAgICBhZGRyZXNzOiAnYWRtaW5AZXhhbXBsZS5jb20nLCAvLyBSZXBsYWNlIHdpdGggYWN0dWFsIGFkbWluIGVtYWlsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybXNcbiAgICBjb25zdCBlcnJvckFsYXJtID0gYXBpLm1ldHJpY1NlcnZlckVycm9yKCkuY3JlYXRlQWxhcm0odGhpcywgJ0FQSUVycm9yQWxhcm0nLCB7XG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sRG9tYWluTmFtZScsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbERvbWFpbi5kb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FQSUdhdGV3YXlVUkwnLCB7XG4gICAgICB2YWx1ZTogYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250VVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTM0J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogd2Vic2l0ZUJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBCdWNrZXQgZm9yIHdlYnNpdGUgaG9zdGluZycsXG4gICAgfSk7XG4gIH1cbn0gIl19