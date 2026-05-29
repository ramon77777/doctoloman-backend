import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppNotification } from '@prisma/client';
import {
  cert,
  getApp,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';

type FirebaseServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type PushDispatchResult = {
  sent: number;
  failed: number;
  skipped: boolean;
  reason?: string;
};

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private initialized = false;
  private disabledReason: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendNeutralPushForNotification(
    notification: AppNotification,
  ): Promise<PushDispatchResult> {
    const messaging = this.messagingOrNull();

    if (!messaging) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: this.disabledReason ?? 'Firebase push désactivé.',
      };
    }

    const devices = await this.prisma.pushDevice.findMany({
      where: {
        userId: notification.userId,
        isActive: true,
      },
      select: {
        token: true,
      },
    });

    const tokens = devices
      .map((device) => device.token.trim())
      .filter((token) => token.length > 0);

    if (tokens.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: true,
        reason: 'Aucun appareil push actif.',
      };
    }

    let sent = 0;
    let failed = 0;
    const invalidTokens = new Set<string>();

    for (const chunk of this.chunkTokens(tokens, 500)) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: 'Docto’Loman',
          body: 'Vous avez une nouvelle notification.',
        },
        data: {
          notificationId: notification.id,
          type: notification.type,
          channel: notification.channel,
        },
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      });

      sent += response.successCount;
      failed += response.failureCount;

      response.responses.forEach((item, index) => {
        if (!item.success && this.isInvalidTokenError(item.error?.code)) {
          invalidTokens.add(chunk[index]);
        }
      });
    }

    if (invalidTokens.size > 0) {
      await this.prisma.pushDevice.updateMany({
        where: {
          token: {
            in: [...invalidTokens],
          },
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });
    }

    return {
      sent,
      failed,
      skipped: false,
    };
  }

  private messagingOrNull() {
    if (!this.isPushEnabled()) {
      this.disabledReason = 'FIREBASE_PUSH_ENABLED différent de true.';
      return null;
    }

    try {
      this.ensureInitialized();
      return getMessaging(getApp());
    } catch (error) {
      this.disabledReason =
        error instanceof Error ? error.message : 'Firebase Admin indisponible.';
      this.logger.warn(this.disabledReason);
      return null;
    }
  }

  private ensureInitialized() {
    if (this.initialized || getApps().length > 0) {
      this.initialized = true;
      return;
    }

    const serviceAccount = this.readServiceAccount();

    initializeApp({
      credential: cert(serviceAccount),
    });

    this.initialized = true;
  }

  private readServiceAccount(): ServiceAccount {
    const rawPath = this.configService
      .get<string>('FIREBASE_SERVICE_ACCOUNT_PATH')
      ?.trim();

    if (!rawPath) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH manquant.');
    }

    const absolutePath = resolve(process.cwd(), rawPath);

    if (!existsSync(absolutePath)) {
      throw new Error(
        `Fichier service account Firebase introuvable : ${absolutePath}`,
      );
    }

    const rawJson = readFileSync(absolutePath, 'utf8');
    const parsed = JSON.parse(rawJson) as FirebaseServiceAccountJson;

    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Fichier service account Firebase invalide.');
    }

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  }

  private isPushEnabled() {
    return (
      this.configService.get<string>('FIREBASE_PUSH_ENABLED')?.trim() === 'true'
    );
  }

  private isInvalidTokenError(code?: string) {
    return (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    );
  }

  private chunkTokens(tokens: string[], size: number) {
    const chunks: string[][] = [];

    for (let index = 0; index < tokens.length; index += size) {
      chunks.push(tokens.slice(index, index + size));
    }

    return chunks;
  }
}
