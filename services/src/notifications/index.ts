import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
// import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Game, GamePlayer } from '../shared/types';

// // const sesClient = new SESClient({});
const snsClient = new SNSClient({});

// const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;
// const ENVIRONMENT = process.env.ENVIRONMENT!;

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log('Processing DynamoDB stream events:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Error processing record:', error, record);
      // Continue processing other records even if one fails
    }
  }
};

async function processRecord(record: DynamoDBRecord): Promise<void> {
  const eventName = record.eventName;
  const dynamodb = record.dynamodb;

  if (!dynamodb || !eventName) {
    return;
  }

  // Handle new player joining a game
  if (eventName === 'INSERT' && dynamodb.NewImage) {
    const newItem = unmarshall(dynamodb.NewImage as any);
    
    // Check if this is a player joining a game
    if (newItem.pk?.startsWith('GAME#') && newItem.sk?.startsWith('PLAYER#')) {
      await handlePlayerJoined(newItem as GamePlayer);
    }
  }

  // Handle game status changes
  if (eventName === 'MODIFY' && dynamodb.NewImage && dynamodb.OldImage) {
    const newItem = unmarshall(dynamodb.NewImage as any);
    const oldItem = unmarshall(dynamodb.OldImage as any);
    
    // Check if this is a game metadata update
    if (newItem.pk?.startsWith('GAME#') && newItem.sk === 'METADATA') {
      await handleGameStatusChange(oldItem as Game, newItem as Game);
    }
  }
}

async function handlePlayerJoined(player: GamePlayer): Promise<void> {
  console.log('Player joined game:', player);
  
  // Send SNS notification (placeholder for mobile push notifications)
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'player_joined',
        gameId: player.gameId,
        userId: player.userId,
        userName: player.userName,
        timestamp: new Date().toISOString(),
      }),
      Subject: 'Player Joined Game',
    }));
  } catch (error) {
    console.error('Error sending SNS notification:', error);
  }
}

async function handleGameStatusChange(oldGame: Game, newGame: Game): Promise<void> {
  console.log('Game status changed:', { 
    gameId: newGame.gameId,
    oldStatus: oldGame.status,
    newStatus: newGame.status,
    oldPlayers: oldGame.currentPlayers,
    newPlayers: newGame.currentPlayers,
  });

  // Game became full
  if (oldGame.currentPlayers < newGame.maxPlayers && newGame.currentPlayers >= newGame.maxPlayers) {
    await sendGameFullNotification(newGame);
  }

  // Game was cancelled
  if (oldGame.status !== 'cancelled' && newGame.status === 'cancelled') {
    await sendGameCancelledNotification(newGame);
  }
}

async function sendGameFullNotification(game: Game): Promise<void> {
  console.log('Sending game full notification for game:', game.gameId);
  
  const subject = 'Pickleball Game is Now Full!';
  const message = `
    Great news! Your pickleball game on ${new Date(game.datetimeUTC).toLocaleDateString()} at ${new Date(game.datetimeUTC).toLocaleTimeString()} is now full with ${game.maxPlayers} players.
    
    Game Details:
    - Date & Time: ${new Date(game.datetimeUTC).toLocaleString()}
    - Location: ${game.courtName}
    - Players: ${game.currentPlayers}/${game.maxPlayers}
    
    Get ready to play!
    
    Best regards,
    Pickle Play Dates Team
  `;

  // Send SNS notification
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'game_full',
        gameId: game.gameId,
        organizerId: game.organizerId,
        datetime: game.datetimeUTC,
        location: game.courtName,
        timestamp: new Date().toISOString(),
      }),
      Subject: subject,
    }));
  } catch (error) {
    console.error('Error sending SNS notification for game full:', error);
  }

  // Note: In a real implementation, you would need to get all players' email addresses
  // and send individual emails. For this MVP, we're just logging the notification.
  console.log('Game full email notification prepared:', { subject, message });
}

async function sendGameCancelledNotification(game: Game): Promise<void> {
  console.log('Sending game cancelled notification for game:', game.gameId);
  
  const subject = 'Pickleball Game Cancelled';
  const message = `
    We're sorry to inform you that your pickleball game has been cancelled.
    
    Game Details:
    - Date & Time: ${new Date(game.datetimeUTC).toLocaleString()}
    - Location: ${game.courtName}
    
    Please check the app for other available games.
    
    Best regards,
    Pickle Play Dates Team
  `;

  // Send SNS notification
  try {
    await snsClient.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'game_cancelled',
        gameId: game.gameId,
        organizerId: game.organizerId,
        datetime: game.datetimeUTC,
        location: game.courtName,
        timestamp: new Date().toISOString(),
      }),
      Subject: subject,
    }));
  } catch (error) {
    console.error('Error sending SNS notification for game cancelled:', error);
  }

  // Note: In a real implementation, you would need to get all players' email addresses
  // and send individual emails. For this MVP, we're just logging the notification.
  console.log('Game cancelled email notification prepared:', { subject, message });
} 