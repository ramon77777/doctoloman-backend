import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationType,
  TeleconsultationSession,
  TeleconsultationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TeleconsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listMine(user: AuthenticatedUser) {
    if (user.role === UserRole.PATIENT) {
      const sessions = await this.listForPatient(user.phone);
      return this.ensureRoomsForSessions(sessions);
    }

    if (user.role === UserRole.PROFESSIONAL) {
      const sessions = await this.listForProfessional(user.id);
      return this.ensureRoomsForSessions(sessions);
    }

    const sessions = await this.listAllForAdmin();
    return this.ensureRoomsForSessions(sessions);
  }

  async getMineById(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    await this.ensureCanAccessSession(user, session);

    return this.ensureRoomForSession(session);
  }

  async getRoomForSession(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    await this.ensureCanAccessSession(user, session);

    if (!session.consentAccepted) {
      throw new ForbiddenException(
        'Le consentement téléconsultation doit être accepté avant l’accès à la salle.',
      );
    }

    if (
      session.status === TeleconsultationStatus.COMPLETED ||
      session.status === TeleconsultationStatus.CANCELLED
    ) {
      throw new ForbiddenException('Cette téléconsultation est clôturée.');
    }

    const sessionWithRoom = await this.ensureRoomForSession(session);

    return {
      sessionId: sessionWithRoom.id,
      roomUrl: sessionWithRoom.roomUrl,
      roomName: this.roomNameFromSession(sessionWithRoom),
      serverUrl: this.jitsiServerUrl(),
      status: sessionWithRoom.status,
    };
  }

  async acceptConsent(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Seul le patient peut accepter le consentement téléconsultation.',
      );
    }

    await this.ensureCanAccessSession(user, session);

    const roomUrl = this.buildRoomUrl(session);

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        consentAccepted: true,
        consentAcceptedAt: new Date(),
        roomUrl,
      },
      include: this.defaultInclude(),
    });
  }

  async markWaiting(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Seul le patient peut rejoindre la salle côté patient.',
      );
    }

    await this.ensureCanAccessSession(user, session);

    const roomUrl = this.buildRoomUrl(session);

    if (session.status !== TeleconsultationStatus.SCHEDULED) {
      return this.prisma.teleconsultationSession.update({
        where: { id },
        data: { roomUrl },
        include: this.defaultInclude(),
      });
    }

    const updatedSession = await this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.WAITING,
        roomUrl,
      },
      include: this.defaultInclude(),
    });

    await this.notifyProfessionalPatientWaiting(updatedSession);

    return updatedSession;
  }

  async start(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    if (user.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Seul le professionnel peut démarrer la téléconsultation.',
      );
    }

    await this.ensureCanAccessSession(user, session);

    if (
      session.status !== TeleconsultationStatus.SCHEDULED &&
      session.status !== TeleconsultationStatus.WAITING
    ) {
      throw new ForbiddenException(
        'Cette téléconsultation ne peut pas être démarrée.',
      );
    }

    if (!session.consentAccepted) {
      throw new ForbiddenException(
        'Le consentement téléconsultation doit être accepté avant le démarrage.',
      );
    }

    const updatedSession = await this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.IN_PROGRESS,
        startedAt: session.startedAt ?? new Date(),
        endedAt: null,
        roomUrl: this.buildRoomUrl(session),
      },
      include: this.defaultInclude(),
    });

    await this.notifyPatientTeleconsultationStarted(updatedSession);

    return updatedSession;
  }

  async end(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    if (user.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Seul le professionnel peut terminer la téléconsultation.',
      );
    }

    await this.ensureCanAccessSession(user, session);

    if (session.status !== TeleconsultationStatus.IN_PROGRESS) {
      throw new ForbiddenException(
        'Seule une téléconsultation en cours peut être terminée.',
      );
    }

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.COMPLETED,
        endedAt: new Date(),
      },
      include: this.defaultInclude(),
    });
  }

  async cancel(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    await this.ensureCanAccessSession(user, session);

    if (
      session.status === TeleconsultationStatus.COMPLETED ||
      session.status === TeleconsultationStatus.CANCELLED
    ) {
      return this.findByIdOrThrow(id);
    }

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.CANCELLED,
        endedAt: new Date(),
      },
      include: this.defaultInclude(),
    });
  }

  async updateStatusForAdmin(
    user: AuthenticatedUser,
    id: string,
    status: TeleconsultationStatus,
  ) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Action réservée à l’administration.');
    }

    const session = await this.findByIdOrThrow(id);

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status,
        roomUrl: this.buildRoomUrl(session),
        startedAt:
          status === TeleconsultationStatus.IN_PROGRESS
            ? new Date()
            : undefined,
        endedAt:
          status === TeleconsultationStatus.COMPLETED ||
          status === TeleconsultationStatus.CANCELLED
            ? new Date()
            : undefined,
      },
      include: this.defaultInclude(),
    });
  }

  private async listForPatient(patientPhone: string) {
    const normalizedPhone = this.normalizePhone(patientPhone);

    return this.prisma.teleconsultationSession.findMany({
      where: {
        patientPhone: normalizedPhone,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      include: this.defaultInclude(),
    });
  }

  private async listForProfessional(userId: string) {
    const professionalProfile =
      await this.prisma.professionalProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

    if (!professionalProfile) {
      return [];
    }

    return this.prisma.teleconsultationSession.findMany({
      where: {
        professionalId: professionalProfile.id,
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      include: this.defaultInclude(),
    });
  }

  private async listAllForAdmin() {
    return this.prisma.teleconsultationSession.findMany({
      orderBy: {
        scheduledAt: 'asc',
      },
      include: this.defaultInclude(),
    });
  }

  private async findByIdOrThrow(id: string) {
    const session = await this.prisma.teleconsultationSession.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!session) {
      throw new NotFoundException('Téléconsultation introuvable.');
    }

    return session;
  }

  private async ensureCanAccessSession(
    user: AuthenticatedUser,
    session: TeleconsultationSession,
  ) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role === UserRole.PATIENT) {
      const userPhone = this.normalizePhone(user.phone);
      const sessionPhone = this.normalizePhone(session.patientPhone);

      if (userPhone && userPhone === sessionPhone) {
        return;
      }

      throw new ForbiddenException(
        'Vous ne pouvez pas accéder à cette téléconsultation.',
      );
    }

    if (user.role === UserRole.PROFESSIONAL) {
      const professionalProfile =
        await this.prisma.professionalProfile.findUnique({
          where: { userId: user.id },
          select: { id: true },
        });

      if (
        professionalProfile &&
        professionalProfile.id === session.professionalId
      ) {
        return;
      }

      throw new ForbiddenException(
        'Vous ne pouvez pas accéder à cette téléconsultation.',
      );
    }

    throw new ForbiddenException(
      'Vous ne pouvez pas accéder à cette téléconsultation.',
    );
  }

  private async ensureRoomsForSessions(
    sessions: TeleconsultationSession[],
  ): Promise<TeleconsultationSession[]> {
    const updatedSessions: TeleconsultationSession[] = [];

    for (const session of sessions) {
      const updatedSession = await this.ensureRoomForSession(session);
      updatedSessions.push(updatedSession);
    }

    return updatedSessions;
  }

  private async ensureRoomForSession(
    session: TeleconsultationSession,
  ): Promise<TeleconsultationSession> {
    if (this.isValidRoomUrl(session.roomUrl)) {
      return session;
    }

    return this.prisma.teleconsultationSession.update({
      where: { id: session.id },
      data: {
        roomUrl: this.buildRoomUrl(session),
      },
      include: this.defaultInclude(),
    });
  }

  private buildRoomUrl(session: TeleconsultationSession) {
    const serverUrl = this.jitsiServerUrl();
    const roomName = this.roomNameFromSession(session);

    return `${serverUrl}/${roomName}`;
  }

  private jitsiServerUrl() {
    const configured = this.configService
      .get<string>('JITSI_SERVER_URL')
      ?.trim();

    const fallback = 'https://meet.jit.si';
    const raw = configured || fallback;

    return raw.replace(/\/+$/g, '');
  }

  private roomNameFromSession(session: TeleconsultationSession) {
    const raw = ['doctoloman', 'tc', session.id].join('-');

    const sanitized = raw
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');

    return sanitized || `doctoloman-tc-${session.id}`;
  }

  private isValidRoomUrl(value: string | null) {
    if (!value) return false;

    const trimmed = value.trim();
    if (!trimmed) return false;

    if (trimmed.startsWith('mock://')) return false;

    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private normalizePhone(value: string) {
    const raw = value.trim();

    if (!raw) return '';

    if (raw.startsWith('+')) {
      const digits = raw.substring(1).replace(/\D/g, '');
      return `+${digits}`;
    }

    const digits = raw.replace(/\D/g, '');

    if (digits.length === 10) {
      return `+225${digits}`;
    }

    if (digits.startsWith('225')) {
      return `+${digits}`;
    }

    return digits;
  }

  private async notifyProfessionalPatientWaiting(
    session: TeleconsultationSession,
  ) {
    const professionalUserId = await this.findProfessionalUserId(
      session.professionalId,
    );

    if (!professionalUserId) {
      return;
    }

    await this.safeCreateNotification({
      userId: professionalUserId,
      type: NotificationType.TELECONSULTATION_PATIENT_WAITING,
      title: 'Docto’Loman',
      message: 'Un patient est en attente pour une téléconsultation.',
      data: {
        sessionId: session.id,
        appointmentId: session.appointmentId,
        status: TeleconsultationStatus.WAITING,
      },
    });
  }

  private async notifyPatientTeleconsultationStarted(
    session: TeleconsultationSession,
  ) {
    const patientUserId = await this.findPatientUserIdByPhone(
      session.patientPhone,
    );

    if (!patientUserId) {
      return;
    }

    await this.safeCreateNotification({
      userId: patientUserId,
      type: NotificationType.TELECONSULTATION_STARTED,
      title: 'Docto’Loman',
      message: 'Votre téléconsultation a démarré.',
      data: {
        sessionId: session.id,
        appointmentId: session.appointmentId,
        status: TeleconsultationStatus.IN_PROGRESS,
      },
    });
  }

  private async findProfessionalUserId(professionalId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      select: { userId: true },
    });

    return professional?.userId ?? null;
  }

  private async findPatientUserIdByPhone(patientPhone: string) {
    const normalizedPhone = this.normalizePhone(patientPhone);

    if (!normalizedPhone) {
      return null;
    }

    const candidates = this.patientPhoneCandidates(normalizedPhone);

    const patient = await this.prisma.user.findFirst({
      where: {
        role: UserRole.PATIENT,
        phone: {
          in: candidates,
        },
      },
      select: {
        id: true,
      },
    });

    return patient?.id ?? null;
  }

  private patientPhoneCandidates(normalizedPhone: string) {
    const cleaned = normalizedPhone.trim();
    const digits = cleaned.replace(/\D/g, '');

    const candidates = new Set<string>();

    if (cleaned) {
      candidates.add(cleaned);
    }

    if (digits) {
      candidates.add(digits);

      if (digits.startsWith('225')) {
        candidates.add(`+${digits}`);
        candidates.add(digits.substring(3));
      }

      if (digits.length === 10) {
        candidates.add(`+225${digits}`);
        candidates.add(`225${digits}`);
      }
    }

    return [...candidates].filter((value) => value.trim().length > 0);
  }

  private async safeCreateNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, string>;
  }) {
    try {
      await this.notificationsService.createNotification({
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data,
      });
    } catch (error) {
      console.warn(
        'DoctoLoman notifications - création notification impossible:',
        error,
      );
    }
  }

  private defaultInclude() {
    return {
      professional: {
        include: {
          appointmentReasons: {
            orderBy: {
              position: 'asc' as const,
            },
          },
          schedules: {
            orderBy: {
              weekday: 'asc' as const,
            },
            include: {
              slots: {
                orderBy: {
                  position: 'asc' as const,
                },
              },
            },
          },
        },
      },
      appointment: true,
    };
  }
}
