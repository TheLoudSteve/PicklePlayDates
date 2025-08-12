import { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Game, GamePlayer } from '../shared/types';
import { getGamePlayers, getUserProfile } from '../shared/dynamodb';

const sesClient = new SESClient({});

// const SES_CONFIGURATION_SET = process.env.SES_CONFIGURATION_SET!;
// const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;
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
  
  // Log player joined event (could be used for push notifications later)
  console.log('Player joined event:', {
    type: 'player_joined',
    gameId: player.gameId,
    userId: player.userId,
    userName: player.userName,
    timestamp: new Date().toISOString(),
  });
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

  // Log game full event (could be used for push notifications later)
  console.log('Game full event:', {
    type: 'game_full',
    gameId: game.gameId,
    organizerId: game.organizerId,
    datetime: game.datetimeUTC,
    location: game.courtName,
    timestamp: new Date().toISOString(),
  });

  // Note: In a real implementation, you would need to get all players' email addresses
  // and send individual emails. For this MVP, we're just logging the notification.
  console.log('Game full email notification prepared:', { subject, message });
}

async function sendGameCancelledNotification(game: Game): Promise<void> {
  console.log('Sending game cancelled notification for game:', game.gameId);
  
  try {
    // Get all players for this game
    const players = await getGamePlayers(game.gameId);
    
    for (const player of players) {
      try {
        // Get player's profile to check notification preferences
        const userProfile = await getUserProfile(player.userId);
        
        if (!userProfile?.notificationPreferences?.emailEnabled ||
            !userProfile?.notificationPreferences?.gameCancellations ||
            !userProfile.email) {
          console.log(`Skipping email for user ${player.userId} - notifications disabled or no email`);
          continue;
        }

        const gameDate = new Date(game.datetimeUTC).toLocaleDateString();
        const gameTime = new Date(game.datetimeUTC).toLocaleTimeString();
        
        const subject = `🏓 Game Cancelled - ${gameDate}`;
        const htmlBody = `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">🏓 Game Cancelled</h2>
              <p>Hi ${userProfile.name || 'there'},</p>
              <p><strong>Unfortunately, your pickleball game has been cancelled.</strong></p>
              
              <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                <h3 style="margin-top: 0; color: #374151;">Cancelled Game Details:</h3>
                <p><strong>📅 Date:</strong> ${gameDate}</p>
                <p><strong>🕐 Time:</strong> ${gameTime}</p>
                <p><strong>📍 Location:</strong> ${game.courtName}</p>
              </div>
              
              <p>We apologize for the inconvenience. Check the app for other available games!</p>
              <p style="color: #6b7280;">- Pickle Play Dates Team</p>
            </body>
          </html>
        `;
        
        const textBody = `🏓 Game Cancelled: Your pickleball game on ${gameDate} at ${gameTime} has been cancelled.

Location: ${game.courtName}

We apologize for the inconvenience. Check the app for other available games!

- Pickle Play Dates`;

        await sesClient.send(new SendEmailCommand({
          Source: 'noreply@pickleplaydates.com', // You'll need to verify this domain/email in SES
          Destination: {
            ToAddresses: [userProfile.email],
          },
          Message: {
            Subject: {
              Data: subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: htmlBody,
                Charset: 'UTF-8',
              },
              Text: {
                Data: textBody,
                Charset: 'UTF-8',
              },
            },
          },
        }));

        console.log(`Sent game cancelled email to ${userProfile.email}`);
      } catch (error) {
        console.error(`Error sending email to player ${player.userId}:`, error);
        // Continue with other players even if one fails
      }
    }
  } catch (error) {
    console.error(`Error sending game cancelled notifications for ${game.gameId}:`, error);
  }

  // Send SNS notification for legacy systems
  // Log game cancelled event (could be used for push notifications later)
  console.log('Game cancelled event:', {
    type: 'game_cancelled',
    gameId: game.gameId,
    organizerId: game.organizerId,
    datetime: game.datetimeUTC,
    location: game.courtName,
    timestamp: new Date().toISOString(),
  });
} 