import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private messaging: admin.messaging.Messaging | null = null;

  constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

      if (!serviceAccountPath) {
        this.logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set - push notifications disabled');
        return;
      }

      // Check if Firebase is already initialized
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(require(serviceAccountPath)),
        });
        this.logger.log('Firebase Admin SDK initialized');
      }

      this.messaging = admin.messaging();
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error instanceof Error ? error.message : String(error)}`);
      this.messaging = null;
    }
  }

  /**
   * Send push notification to a single device token
   */
  async sendToDevice(token: string, payload: PushNotificationPayload): Promise<string | null> {
    if (!this.messaging) {
      this.logger.warn('Firebase messaging not initialized - skipping push');
      return null;
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            badge: 'https://calorie-ai.app/badge-192x192.png',
            icon: 'https://calorie-ai.app/icon-192x192.png',
          },
        },
        android: {
          priority: 'high',
          notification: {
            title: payload.title,
            body: payload.body,
            channelId: 'reminders',
            priority: 'max',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              badge: 1,
              sound: 'default',
            },
          },
        },
      };

      if (payload.data) {
        message.data = payload.data;
      }

      const messageId = await this.messaging.send(message);
      this.logger.debug(`Push sent to ${token}: ${messageId}`);
      return messageId;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('registration token') || error.message.includes('invalid-argument'))
      ) {
        this.logger.warn(`Invalid or expired token ${token}, marking for deletion`);
        return null; // Signal token should be deleted
      }
      this.logger.error(
        `Failed to send push to ${token}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Send push notification to multiple tokens
   */
  async sendToMultiple(tokens: string[], payload: PushNotificationPayload): Promise<Record<string, string | null>> {
    const results: Record<string, string | null> = {};

    for (const token of tokens) {
      results[token] = await this.sendToDevice(token, payload);
    }

    return results;
  }

  /**
   * Check if Firebase is available
   */
  isAvailable(): boolean {
    return this.messaging !== null;
  }
}
