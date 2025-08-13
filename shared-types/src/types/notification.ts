import { NotificationMethod } from './common';

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  emailEnabled: boolean;
  gameReminders: boolean;
  gameCancellations: boolean;
  preferredMethod: NotificationMethod;
}

/**
 * Notification event types
 */
export type NotificationEventType = 
  | 'game.created'
  | 'game.cancelled' 
  | 'game.full'
  | 'game.reminder.24h'
  | 'game.reminder.1h'
  | 'player.joined'
  | 'player.left'
  | 'player.kicked';

/**
 * Base notification structure
 */
export interface BaseNotification {
  eventType: NotificationEventType;
  recipientUserId: string;
  recipientEmail: string;
  recipientName: string;
}

/**
 * Game-related notification data
 */
export interface GameNotificationData {
  gameId: string;
  organizerId: string;
  organizerName: string;
  datetimeUTC: string;
  courtName: string;
  courtAddress: string;
}

/**
 * Player-related notification data
 */
export interface PlayerNotificationData {
  userId: string;
  userName: string;
  dupr?: string;
}

/**
 * Game created notification
 */
export interface GameCreatedNotification extends BaseNotification {
  eventType: 'game.created';
  gameData: GameNotificationData;
}

/**
 * Game cancelled notification
 */
export interface GameCancelledNotification extends BaseNotification {
  eventType: 'game.cancelled';
  gameData: GameNotificationData;
  reason?: string;
}

/**
 * Game full notification
 */
export interface GameFullNotification extends BaseNotification {
  eventType: 'game.full';
  gameData: GameNotificationData;
}

/**
 * Game reminder notification
 */
export interface GameReminderNotification extends BaseNotification {
  eventType: 'game.reminder.24h' | 'game.reminder.1h';
  gameData: GameNotificationData;
  hoursUntilGame: number;
}

/**
 * Player joined notification
 */
export interface PlayerJoinedNotification extends BaseNotification {
  eventType: 'player.joined';
  gameData: GameNotificationData;
  playerData: PlayerNotificationData;
}

/**
 * Player left notification
 */
export interface PlayerLeftNotification extends BaseNotification {
  eventType: 'player.left';
  gameData: GameNotificationData;
  playerData: PlayerNotificationData;
}

/**
 * Player kicked notification
 */
export interface PlayerKickedNotification extends BaseNotification {
  eventType: 'player.kicked';
  gameData: GameNotificationData;
  playerData: PlayerNotificationData;
  kickedBy: string;
}

/**
 * Union type for all notifications
 */
export type Notification = 
  | GameCreatedNotification
  | GameCancelledNotification
  | GameFullNotification
  | GameReminderNotification
  | PlayerJoinedNotification
  | PlayerLeftNotification
  | PlayerKickedNotification;