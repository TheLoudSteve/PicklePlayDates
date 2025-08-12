import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand,
  TransactWriteCommand 
} from '@aws-sdk/lib-dynamodb';
import { Game, GamePlayer, UserProfile, Court } from './types';

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

// Query all available games (for "Upcoming Games" tab)
export async function getAllAvailableGames(): Promise<Game[]> {
  try {
    const now = new Date().toISOString();

    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(pk, :gamePrefix) AND sk = :metadata AND datetimeUTC > :now AND #status = :scheduled',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':gamePrefix': 'GAME#',
        ':metadata': 'METADATA',
        ':now': now,
        ':scheduled': 'scheduled'
      }
    }));

    // Sort by datetime (earliest first)
    const games = (result.Items as Game[] || []).sort((a, b) =>
      new Date(a.datetimeUTC).getTime() - new Date(b.datetimeUTC).getTime()
    );

    // Fetch players for each game
    const gamesWithPlayers = await Promise.all(
      games.map(async (game) => {
        const players = await getGamePlayers(game.gameId);
        return {
          ...game,
          players: players.map(player => ({
            userId: player.userId,
            userName: player.userName,
            joinedAt: player.joinedAt,
            dupr: player.dupr
          }))
        };
      })
    );

    return gamesWithPlayers;
  } catch (error) {
    console.error('Error getting all available games:', error);
    throw error;
  }
}

// Court management functions
export async function putCourt(court: Court): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: court
    }));
  } catch (error) {
    console.error('Error putting court:', error);
    throw error;
  }
}

export async function getCourt(courtId: string): Promise<Court | null> {
  try {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `COURT#${courtId}`,
        sk: 'METADATA'
      }
    }));
    return result.Item as Court || null;
  } catch (error) {
    console.error('Error getting court:', error);
    throw error;
  }
}

export async function updateCourt(courtId: string, updates: Partial<Court>): Promise<void> {
  try {
    const updateExpressions = [];
    const expressionAttributeNames: any = {};
    const expressionAttributeValues: any = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && key !== 'pk' && key !== 'sk' && key !== 'courtId') {
        updateExpressions.push(`#${key} = :${key}`);
        expressionAttributeNames[`#${key}`] = key;
        expressionAttributeValues[`:${key}`] = value;
      }
    }
    
    if (updateExpressions.length === 0) {
      return;
    }
    
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: `COURT#${courtId}`,
        sk: 'METADATA'
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues
    }));
  } catch (error) {
    console.error('Error updating court:', error);
    throw error;
  }
}

export async function searchCourts(options: {
  city?: string;
  latitude?: number;
  longitude?: number;
  radius?: number; // in kilometers
  isApproved?: boolean;
  isActive?: boolean;
}): Promise<Court[]> {
  try {
    let filterExpressions = ['begins_with(pk, :courtPrefix) AND sk = :metadata'];
    const expressionAttributeValues: any = {
      ':courtPrefix': 'COURT#',
      ':metadata': 'METADATA'
    };
    const expressionAttributeNames: any = {};

    if (options.isApproved !== undefined) {
      filterExpressions.push('isApproved = :isApproved');
      expressionAttributeValues[':isApproved'] = options.isApproved;
    }

    if (options.isActive !== undefined) {
      filterExpressions.push('isActive = :isActive');
      expressionAttributeValues[':isActive'] = options.isActive;
    }

    if (options.city) {
      filterExpressions.push('contains(#city, :city)');
      expressionAttributeNames['#city'] = 'city';
      expressionAttributeValues[':city'] = options.city;
    }

    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: filterExpressions.join(' AND '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues
    }));

    let courts = result.Items as Court[] || [];

    // Filter by distance if coordinates provided
    if (options.latitude && options.longitude && options.radius) {
      courts = courts.filter(court => {
        const distance = calculateDistance(
          options.latitude!,
          options.longitude!,
          court.latitude,
          court.longitude
        );
        return distance <= options.radius!;
      });
    }

    return courts.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error searching courts:', error);
    throw error;
  }
}

export async function getAllCourts(isApproved: boolean = true): Promise<Court[]> {
  try {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(pk, :courtPrefix) AND sk = :metadata AND isApproved = :isApproved AND isActive = :isActive',
      ExpressionAttributeValues: {
        ':courtPrefix': 'COURT#',
        ':metadata': 'METADATA',
        ':isApproved': isApproved,
        ':isActive': true
      }
    }));

    return (result.Items as Court[] || []).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error getting all courts:', error);
    throw error;
  }
}

export async function getCourtsByUser(userId: string): Promise<Court[]> {
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'gsi2', // GSI2 is on gsi2pk, gsi2sk
      KeyConditionExpression: 'gsi2pk = :userPk',
      FilterExpression: 'sk = :metadata',
      ExpressionAttributeValues: {
        ':userPk': `USER#${userId}`,
        ':metadata': 'METADATA'
      }
    }));

    return result.Items as Court[] || [];
  } catch (error) {
    console.error('Error getting courts by user:', error);
    throw error;
  }
}

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

// Query user's games (both as organizer and as player)

export async function getUserGames(
  userId: string, 
  range: 'upcoming' | 'past'
): Promise<Game[]> {
  try {
    console.log(`getUserGames called: userId=${userId}, range=${range}`);
    const now = new Date();
    const nowISOString = now.toISOString();
    console.log(`Current time: ${nowISOString}`);
    
    // 1. Get ALL games where user is the organizer (no time filtering in DB)
    const organizerGamesResult = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'gsi2',
      KeyConditionExpression: 'gsi2pk = :userPk',
      FilterExpression: 'sk = :metadata',
      ExpressionAttributeValues: {
        ':userPk': `USER#${userId}`,
        ':metadata': 'METADATA'
      }
    }));
    
    const allOrganizerGames = organizerGamesResult.Items as Game[] || [];
    console.log(`Found ${allOrganizerGames.length} organizer games`);
    
    // 2. Get games where user is a player (from GamePlayer records)
    const playerRecordsResult = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'sk = :playerSk',
      ExpressionAttributeValues: {
        ':playerSk': `PLAYER#${userId}`
      }
    }));
    
    // Extract game IDs from player records
    const gameIds = (playerRecordsResult.Items || []).map((item: any) => 
      item.pk.replace('GAME#', '')
    );
    console.log(`Found ${gameIds.length} games where user is a player`);
    
    // 3. Get the actual Game records for games where user is a player
    const allPlayerGames: Game[] = [];
    for (const gameId of gameIds) {
      try {
        const game = await getGame(gameId);
        if (game) {
          allPlayerGames.push(game);
        }
      } catch (error) {
        console.error(`Error getting game ${gameId}:`, error);
        // Continue with other games
      }
    }
    
    // 4. Combine and deduplicate games
    const allGames = [...allOrganizerGames];
    for (const playerGame of allPlayerGames) {
      if (!allGames.find(g => g.gameId === playerGame.gameId)) {
        allGames.push(playerGame);
      }
    }
    console.log(`Total games before time filtering: ${allGames.length}`);
    
    // 5. Apply time filtering in JavaScript (more reliable)
    const filteredGames = allGames.filter(game => {
      try {
        const gameTime = new Date(game.datetimeUTC);
        
        // Check if the date is valid
        if (isNaN(gameTime.getTime())) {
          console.log(`Game ${game.gameId}: Invalid datetime '${game.datetimeUTC}' - skipping`);
          return false;
        }
        
        const gameTimeISO = gameTime.toISOString();
        console.log(`Game ${game.gameId}: ${gameTimeISO}, range: ${range}`);
        
        if (range === 'upcoming') {
          const isUpcoming = gameTime > now;
          console.log(`  Is upcoming? ${isUpcoming} (${gameTimeISO} > ${nowISOString})`);
          return isUpcoming;
        } else {
          // For past games: game started more than 2 hours ago
          const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
          const isPast = gameTime < twoHoursAgo;
          console.log(`  Is past? ${isPast} (${gameTimeISO} < ${twoHoursAgo.toISOString()})`);
          return isPast;
        }
      } catch (error) {
        console.log(`Game ${game.gameId}: Error parsing datetime '${game.datetimeUTC}' - ${(error as Error).message} - skipping`);
        return false;
      }
    });
    
    console.log(`Games after time filtering: ${filteredGames.length}`);
    
    // 6. Sort by datetime
    filteredGames.sort((a, b) => {
      const dateA = new Date(a.datetimeUTC).getTime();
      const dateB = new Date(b.datetimeUTC).getTime();
      return range === 'upcoming' ? dateA - dateB : dateB - dateA;
    });
    
    return filteredGames;
  } catch (error) {
    console.error('Error getting user games:', error);
    throw error;
  }
} 