import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 

  TransactWriteCommand 
} from '@aws-sdk/lib-dynamodb';
import { Game, GamePlayer, UserProfile } from './types';

const client = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME!;

// Game operations
export async function getGame(gameId: string): Promise<Game | null> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `GAME#${gameId}`,
        sk: 'METADATA'
      }
    }));
    return result.Item as Game | null;
  } catch (error) {
    console.error('Error getting game:', error);
    throw error;
  }
}

export async function putGame(game: Game): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: game
    }));
  } catch (error) {
    console.error('Error putting game:', error);
    throw error;
  }
}

export async function updateGame(
  gameId: string, 
  updates: Partial<Game>
): Promise<void> {
  try {
    const updateExpression = Object.keys(updates)
      .map(key => `#${key} = :${key}`)
      .join(', ');
    
    const expressionAttributeNames = Object.keys(updates)
      .reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {});
    
    const expressionAttributeValues = Object.entries(updates)
      .reduce((acc, [key, value]) => ({ ...acc, [`:${key}`]: value }), {});

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `GAME#${gameId}`,
        sk: 'METADATA'
      },
      UpdateExpression: `SET ${updateExpression}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
  } catch (error) {
    console.error('Error updating game:', error);
    throw error;
  }
}

export async function deleteGame(gameId: string): Promise<void> {
  try {
    // First get all players to delete them too
    const players = await getGamePlayers(gameId);
    
    const transactItems = [
      {
        Delete: {
          TableName: TABLE_NAME,
          Key: {
            pk: `GAME#${gameId}`,
            sk: 'METADATA'
          }
        }
      },
      ...players.map(player => ({
        Delete: {
          TableName: TABLE_NAME,
          Key: {
            pk: `GAME#${gameId}`,
            sk: `PLAYER#${player.userId}`
          }
        }
      }))
    ];

    await ddb.send(new TransactWriteCommand({
      TransactItems: transactItems
    }));
  } catch (error) {
    console.error('Error deleting game:', error);
    throw error;
  }
}

// Game player operations
export async function getGamePlayers(gameId: string): Promise<GamePlayer[]> {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `GAME#${gameId}`,
        ':sk': 'PLAYER#'
      }
    }));
    return result.Items as GamePlayer[] || [];
  } catch (error) {
    console.error('Error getting game players:', error);
    throw error;
  }
}

export async function addPlayerToGame(
  _gameId: string, 
  player: GamePlayer
): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: player,
      ConditionExpression: 'attribute_not_exists(pk)'
    }));
  } catch (error) {
    console.error('Error adding player to game:', error);
    throw error;
  }
}

export async function removePlayerFromGame(
  gameId: string, 
  userId: string
): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `GAME#${gameId}`,
        sk: `PLAYER#${userId}`
      }
    }));
  } catch (error) {
    console.error('Error removing player from game:', error);
    throw error;
  }
}

// User profile operations
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: 'PROFILE'
      }
    }));
    return result.Item as UserProfile | null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

export async function putUserProfile(profile: UserProfile): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: profile
    }));
  } catch (error) {
    console.error('Error putting user profile:', error);
    throw error;
  }
}

export async function updateUserProfile(
  userId: string, 
  updates: Partial<UserProfile>
): Promise<void> {
  try {
    const updateExpression = Object.keys(updates)
      .map(key => `#${key} = :${key}`)
      .join(', ');
    
    const expressionAttributeNames = Object.keys(updates)
      .reduce((acc, key) => ({ ...acc, [`#${key}`]: key }), {});
    
    const expressionAttributeValues = Object.entries(updates)
      .reduce((acc, [key, value]) => ({ ...acc, [`:${key}`]: value }), {});

    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `USER#${userId}`,
        sk: 'PROFILE'
      },
      UpdateExpression: `SET ${updateExpression}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

// Query user's games
export async function getUserGames(
  userId: string, 
  range: 'upcoming' | 'past'
): Promise<Game[]> {
  try {
    const now = new Date().toISOString();
    const indexName = range === 'upcoming' ? 'gsi1' : 'gsi2';
    
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: indexName,
      KeyConditionExpression: 'gsi1pk = :pk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':now': now
      },
      FilterExpression: range === 'upcoming' 
        ? 'datetimeUTC > :now' 
        : 'datetimeUTC <= :now',
      ScanIndexForward: range === 'upcoming' ? true : false
    }));
    
    return result.Items as Game[] || [];
  } catch (error) {
    console.error('Error getting user games:', error);
    throw error;
  }
} 