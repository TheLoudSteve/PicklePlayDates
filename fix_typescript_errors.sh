#!/bin/bash

# Fix AppError conflict in utils.ts
sed -i '' 's/import { APIResponse, JWTPayload, AppError, ValidationError } from/import { JWTPayload, ValidationError } from/' services/src/shared/utils.ts

# Remove AppError interface from types.ts
sed -i '' '/export interface AppError extends Error {/,/}/d' services/src/shared/types.ts

# Fix ValidationError type in AppError class
sed -i '' 's/validationErrors?: ValidationError\[\]/validationErrors?: ValidationError[] | undefined/' services/src/shared/utils.ts

# Remove unused AppError imports from Lambda functions
sed -i '' 's/  AppError,//' services/src/create-game/index.ts
sed -i '' 's/  AppError,//' services/src/join-game/index.ts  
sed -i '' 's/  AppError,//' services/src/leave-game/index.ts

# Fix GamePlayer dupr type
sed -i '' 's/dupr?: string/dupr?: DUPRLevel/' services/src/shared/types.ts

# Remove unused imports from notifications
sed -i '' 's/SendEmailCommand, //' services/src/notifications/index.ts
sed -i '' 's/const sesClient = new SESClient({});/\/\/ const sesClient = new SESClient({});/' services/src/notifications/index.ts
sed -i '' 's/const SES_CONFIGURATION_SET/\/\/ const SES_CONFIGURATION_SET/' services/src/notifications/index.ts
sed -i '' 's/const ENVIRONMENT/\/\/ const ENVIRONMENT/' services/src/notifications/index.ts

# Remove unused imports from dynamodb
sed -i '' 's/  ScanCommand,//' services/src/shared/dynamodb.ts

# Remove unused parameter in dynamodb function
sed -i '' 's/gameId: string,/_gameId: string,/' services/src/shared/dynamodb.ts

# Fix DynamoDB unmarshall type issues
sed -i '' 's/const newItem = unmarshall(dynamodb.NewImage);/const newItem = unmarshall(dynamodb.NewImage!);/' services/src/notifications/index.ts
sed -i '' 's/const oldItem = unmarshall(dynamodb.OldImage);/const oldItem = unmarshall(dynamodb.OldImage!);/' services/src/notifications/index.ts

echo "TypeScript errors fixed!"
