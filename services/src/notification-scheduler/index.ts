import { EventBridgeEvent, ScheduledEvent } from 'aws-lambda';
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand, DeleteRuleCommand, RemoveTargetsCommand } from '@aws-sdk/client-eventbridge';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getGamePlayers, getUserProfile } from '../shared/dynamodb';
import { Game } from '../shared/types';

const eventBridgeClient = new EventBridgeClient({});
const sesClient = new SESClient({});

export const handler = async (event: EventBridgeEvent<string, any> | ScheduledEvent): Promise<void> => {
  console.log('Notification scheduler triggered:', JSON.stringify(event, null, 2));

  // Check if this is a scheduled reminder event
  if ('source' in event && event.source === 'aws.events' && event['detail-type'] === 'Scheduled Event') {
    await handleScheduledReminder(event as ScheduledEvent);
  } 
  // This could be triggered by DynamoDB streams via EventBridge for new games
  else if ('detail' in event && event.detail?.eventName === 'INSERT' && event.detail?.dynamodb?.NewImage) {
    await handleNewGame(event.detail);
  }
};

async function handleScheduledReminder(event: ScheduledEvent): Promise<void> {
  try {
    const ruleName = event.resources[0].split('/').pop();
    if (!ruleName) {
      console.error('Could not extract rule name from event');
      return;
    }

    // Parse rule name to extract game ID and reminder type
    // Rule name format: "game-reminder-{gameId}-{24h|1h}"
    const match = ruleName.match(/^game-reminder-(.+)-(24h|1h)$/);
    if (!match) {
      console.error('Invalid rule name format:', ruleName);
      return;
    }

    const [, gameId, reminderType] = match;
    console.log(`Sending ${reminderType} reminder for game ${gameId}`);

    await sendGameReminder(gameId, reminderType);

    // Clean up the rule after execution
    await cleanupRule(ruleName);
  } catch (error) {
    console.error('Error handling scheduled reminder:', error);
  }
}

async function handleNewGame(gameData: any): Promise<void> {
  try {
    const gameImage = gameData.dynamodb.NewImage;
    
    // Only process game metadata records, not player records
    if (gameImage.sk?.S !== 'METADATA') {
      return;
    }

    const game: Game = {
      gameId: gameImage.gameId.S,
      datetimeUTC: gameImage.datetimeUTC.S,
      organizerId: gameImage.organizerId.S,
      courtName: gameImage.courtName.S,
      // ... other game properties (we only need the essentials for scheduling)
    } as Game;

    await scheduleGameReminders(game);
  } catch (error) {
    console.error('Error handling new game:', error);
  }
}

async function scheduleGameReminders(game: Game): Promise<void> {
  try {
    const gameDateTime = new Date(game.datetimeUTC);
    const now = new Date();

    // Schedule 24h reminder
    const reminder24h = new Date(gameDateTime.getTime() - 24 * 60 * 60 * 1000);
    // Allow 10-minute grace period for games created close to reminder time
    const gracePeriodMs = 10 * 60 * 1000; // 10 minutes
    const timeDiff = reminder24h.getTime() - now.getTime();
    
    if (timeDiff > gracePeriodMs) {
      // Schedule future reminder via EventBridge
      await scheduleReminder(game.gameId, reminder24h, '24h');
    } else if (timeDiff > -gracePeriodMs) {
      // Send immediate reminder (within grace period)
      console.log(`24h reminder for game ${game.gameId} is within grace period, sending immediately`);
      await sendGameReminder(game.gameId, '24h');
    } else {
      console.log(`24h reminder for game ${game.gameId} is in the past, skipping.`);
    }

    // Schedule 1h reminder  
    const reminder1h = new Date(gameDateTime.getTime() - 60 * 60 * 1000);
    const timeDiff1h = reminder1h.getTime() - now.getTime();
    
    if (timeDiff1h > gracePeriodMs) {
      // Schedule future reminder via EventBridge
      await scheduleReminder(game.gameId, reminder1h, '1h');
    } else if (timeDiff1h > -gracePeriodMs) {
      // Send immediate reminder (within grace period)
      console.log(`1h reminder for game ${game.gameId} is within grace period, sending immediately`);
      await sendGameReminder(game.gameId, '1h');
    } else {
      console.log(`1h reminder for game ${game.gameId} is in the past, skipping.`);
    }

    console.log(`Scheduled reminders for game ${game.gameId}`);
  } catch (error) {
    console.error('Error scheduling game reminders:', error);
  }
}

async function scheduleReminder(gameId: string, reminderTime: Date, reminderType: string): Promise<void> {
  const ruleName = `game-reminder-${gameId}-${reminderType}`;
  
  // Create EventBridge rule with cron expression for one-time execution
  // EventBridge format: cron(minute hour day-of-month month day-of-week year)
  const cronExpression = `cron(${reminderTime.getUTCMinutes()} ${reminderTime.getUTCHours()} ${reminderTime.getUTCDate()} ${reminderTime.getUTCMonth() + 1} ? ${reminderTime.getUTCFullYear()})`;
  
  try {
    await eventBridgeClient.send(new PutRuleCommand({
      Name: ruleName,
      Description: `${reminderType} reminder for game ${gameId}`,
      ScheduleExpression: cronExpression,
      State: 'ENABLED',
    }));

    // Add this Lambda as target (construct ARN dynamically)
    const functionArn = `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:pickle-play-dates-notification-scheduler-${process.env.ENVIRONMENT}`;
    
    await eventBridgeClient.send(new PutTargetsCommand({
      Rule: ruleName,
      Targets: [{
        Id: '1',
        Arn: functionArn,
      }],
    }));

    console.log(`Scheduled ${reminderType} reminder for game ${gameId} at ${reminderTime.toISOString()} with cron: ${cronExpression}`);
  } catch (error) {
    console.error(`Error scheduling ${reminderType} reminder for game ${gameId}:`, error);
    console.error(`Attempted cron expression: ${cronExpression}`);
    console.error(`Reminder time: ${reminderTime.toISOString()}`);
  }
}

async function sendGameReminder(gameId: string, reminderType: string): Promise<void> {
  try {
    // Get game details first
    const { getGame } = await import('../shared/dynamodb');
    const game = await getGame(gameId);
    
    if (!game) {
      console.error(`Game ${gameId} not found for reminder`);
      return;
    }

    // Get all players for this game
    const players = await getGamePlayers(gameId);
    
    for (const player of players) {
      try {
        // Get player's profile to check notification preferences
        const userProfile = await getUserProfile(player.userId);
        
        if (!userProfile?.notificationPreferences?.emailEnabled ||
            !userProfile?.notificationPreferences?.gameReminders ||
            !userProfile.email) {
          console.log(`Skipping email for user ${player.userId} - notifications disabled or no email`);
          continue;
        }

        const gameDate = new Date(game.datetimeUTC);
        const timeLabel = reminderType === '24h' ? '24 hours' : '1 hour';
        const formattedDate = gameDate.toLocaleDateString();
        const formattedTime = gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const subject = `🏓 Pickleball Game Reminder - ${timeLabel} to go!`;
        const htmlBody = `
          <html>
            <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">🏓 Game Reminder</h2>
              <p>Hi ${userProfile.name || 'there'},</p>
              <p><strong>Your pickleball game is in ${timeLabel}!</strong></p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #374151;">Game Details:</h3>
                <p><strong>📅 Date:</strong> ${formattedDate}</p>
                <p><strong>🕐 Time:</strong> ${formattedTime}</p>
                <p><strong>📍 Location:</strong> ${game.courtName}</p>
                <p><strong>👥 Players:</strong> ${game.currentPlayers}/${game.maxPlayers}</p>
              </div>
              
              <p>See you on the court!</p>
              <p style="color: #6b7280;">- Pickle Play Dates Team</p>
            </body>
          </html>
        `;
        
        const textBody = `🏓 Reminder: Your pickleball game is in ${timeLabel}!

📅 ${formattedDate} at ${formattedTime}
📍 ${game.courtName}
👥 ${game.currentPlayers}/${game.maxPlayers} players

See you on the court!

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

        console.log(`Sent ${reminderType} reminder email to ${userProfile.email}`);
      } catch (error) {
        console.error(`Error sending email to player ${player.userId}:`, error);
        // Continue with other players even if one fails
      }
    }
  } catch (error) {
    console.error(`Error sending game reminders for ${gameId}:`, error);
  }
}

async function cleanupRule(ruleName: string): Promise<void> {
  try {
    // Remove targets first
    await eventBridgeClient.send(new RemoveTargetsCommand({
      Rule: ruleName,
      Ids: ['1'],
    }));

    // Then delete the rule
    await eventBridgeClient.send(new DeleteRuleCommand({
      Name: ruleName,
    }));

    console.log(`Cleaned up rule: ${ruleName}`);
  } catch (error) {
    console.error(`Error cleaning up rule ${ruleName}:`, error);
  }
}
