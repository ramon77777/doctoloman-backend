import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TeleconsultationSession,
  TeleconsultationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Injectable()
export class TeleconsultationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(user: AuthenticatedUser) {
    if (user.role === UserRole.PATIENT) {
      return this.listForPatient(user.phone);
    }

    if (user.role === UserRole.PROFESSIONAL) {
      return this.listForProfessional(user.id);
    }

    return this.listAllForAdmin();
  }

  async getMineById(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    await this.ensureCanAccessSession(user, session);

    return this.findByIdOrThrow(id);
  }

  async acceptConsent(user: AuthenticatedUser, id: string) {
    const session = await this.findByIdOrThrow(id);

    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Seul le patient peut accepter le consentement téléconsultation.',
      );
    }

    await this.ensureCanAccessSession(user, session);

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        consentAccepted: true,
        consentAcceptedAt: new Date(),
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

    if (session.status !== TeleconsultationStatus.SCHEDULED) {
      return this.findByIdOrThrow(id);
    }

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.WAITING,
      },
      include: this.defaultInclude(),
    });
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

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status: TeleconsultationStatus.IN_PROGRESS,
        startedAt: session.startedAt ?? new Date(),
        endedAt: null,
      },
      include: this.defaultInclude(),
    });
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
      throw new ForbiddenException(
        'Action réservée à l’administration.',
      );
    }

    await this.findByIdOrThrow(id);

    return this.prisma.teleconsultationSession.update({
      where: { id },
      data: {
        status,
        startedAt:
          status === TeleconsultationStatus.IN_PROGRESS ? new Date() : undefined,
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