import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AppNotification,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  PushDevice,
  PushDevicePlatform,
} from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushDeviceDto } from './dto/register-push-device.dto';
import { UnregisterPushDeviceDto } from './dto/unregister-push-device.dto';
import { FirebasePushService } from './firebase-push.service';

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  channel?: NotificationChannel;
  data?: Prisma.InputJsonValue;
  scheduledAt?: Date;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebasePushService: FirebasePushService,
  ) {}

  async registerPushDevice(
    user: AuthenticatedUser,
    dto: RegisterPushDeviceDto,
  ): Promise<PushDevice> {
    const token = this.cleanToken(dto.token);

    if (!token) {
      throw new BadRequestException('Token push invalide.');
    }

    const platform = dto.platform ?? PushDevicePlatform.UNKNOWN;

    return this.prisma.pushDevice.upsert({
      where: { token },
      create: {
        userId: user.id,
        token,
        platform,
        deviceName: this.optionalText(dto.deviceName),
        appVersion: this.optionalText(dto.appVersion),
        isActive: true,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      update: {
        userId: user.id,
        platform,
        deviceName: this.optionalText(dto.deviceName),
        appVersion: this.optionalText(dto.appVersion),
        isActive: true,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
    });
  }

  async unregisterPushDevice(
    user: AuthenticatedUser,
    dto: UnregisterPushDeviceDto,
  ): Promise<{ success: true }> {
    const token = this.cleanToken(dto.token);

    if (!token) {
      throw new BadRequestException('Token push invalide.');
    }

    await this.prisma.pushDevice.updateMany({
      where: {
        token,
        userId: user.id,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async listMyPushDevices(user: AuthenticatedUser) {
    const items = await this.prisma.pushDevice.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
    });

    return {
      items,
      count: items.length,
    };
  }

  async listMyNotifications(user: AuthenticatedUser) {
    const items = await this.prisma.appNotification.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    return {
      items,
      count: items.length,
    };
  }

  async markNotificationAsRead(
    user: AuthenticatedUser,
    notificationId: string,
  ): Promise<AppNotification | null> {
    const id = notificationId.trim();

    if (!id) {
      throw new BadRequestException('Notification invalide.');
    }

    const notification = await this.prisma.appNotification.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!notification) {
      return null;
    }

    return this.prisma.appNotification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  async createNotification(
    input: CreateNotificationInput,
  ): Promise<AppNotification> {
    const title = this.cleanText(input.title);
    const message = this.cleanText(input.message);

    if (!title || !message) {
      throw new BadRequestException('Titre et message notification requis.');
    }

    const createData: Prisma.AppNotificationUncheckedCreateInput = {
      userId: input.userId,
      type: input.type,
      channel: input.channel ?? NotificationChannel.PUSH,
      status: NotificationStatus.PENDING,
      title,
      message,
      scheduledAt: input.scheduledAt,
    };

    if (input.data !== undefined) {
      createData.data = input.data;
    }

    const notification = await this.prisma.appNotification.create({
      data: createData,
    });

    await this.dispatchNeutralPush(notification);

    return notification;
  }

  async markNotificationSent(notificationId: string) {
    return this.prisma.appNotification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        failureReason: null,
      },
    });
  }

  async markNotificationFailed(notificationId: string, reason: string) {
    return this.prisma.appNotification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED,
        failureReason: this.cleanText(reason).slice(0, 500),
      },
    });
  }

  async activePushTokensForUser(userId: string): Promise<string[]> {
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        token: true,
      },
    });

    return devices
      .map((device) => device.token.trim())
      .filter((token) => token.length > 0);
  }

  private async dispatchNeutralPush(notification: AppNotification) {
    if (notification.channel !== NotificationChannel.PUSH) {
      return;
    }

    try {
      const result =
        await this.firebasePushService.sendNeutralPushForNotification(
          notification,
        );

      if (result.skipped) {
        return;
      }

      if (result.sent > 0) {
        await this.markNotificationSent(notification.id);
        return;
      }

      await this.markNotificationFailed(
        notification.id,
        'Aucun push Firebase envoyé.',
      );
    } catch (error) {
      await this.markNotificationFailed(
        notification.id,
        error instanceof Error ? error.message : 'Erreur Firebase inconnue.',
      );
    }
  }

  private cleanToken(value: string) {
    return value.trim();
  }

  private cleanText(value: string) {
    return value.trim().replace(/\s+/g, ' ');
  }

  private optionalText(value?: string) {
    const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';
    return cleaned.length > 0 ? cleaned : null;
  }
}
