import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  TeleconsultationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

const MINIMUM_LEAD_TIME_MINUTES = 60;

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: AuthenticatedUser, dto: CreateAppointmentDto) {
    if (currentUser.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Seul un compte patient peut créer une demande de rendez-vous.',
      );
    }

    if (!dto.consentAccepted) {
      throw new BadRequestException(
        'Le consentement est requis pour créer une demande de rendez-vous.',
      );
    }

    const professionalId = this.cleanText(dto.professionalId);
    const reasonLabel = this.cleanText(dto.reason);
    const slot = this.normalizeSlot(dto.slot);
    const day = this.parseDateOnly(dto.day);

    if (!professionalId) {
      throw new BadRequestException('Professionnel requis.');
    }

    if (!reasonLabel) {
      throw new BadRequestException('Motif requis.');
    }

    if (!day) {
      throw new BadRequestException('Date invalide.');
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      include: {
        appointmentReasons: {
          where: { isActive: true },
          orderBy: { position: 'asc' },
        },
        schedules: {
          include: {
            slots: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professionnel introuvable.');
    }

    const reason = professional.appointmentReasons.find(
      (item) => this.normalizeLoose(item.label) === this.normalizeLoose(reasonLabel),
    );

    if (!reason) {
      throw new BadRequestException(
        'Motif indisponible pour ce professionnel.',
      );
    }

    const scheduledAt = this.combineDateAndSlot(day, slot);

    if (
      scheduledAt.getTime() <=
      Date.now() + MINIMUM_LEAD_TIME_MINUTES * 60 * 1000
    ) {
      throw new BadRequestException(
        'Ce créneau est trop proche. La réservation doit se faire au moins 1h à l’avance.',
      );
    }

    this.assertSlotIsAvailableInSchedule({
      day,
      slot,
      durationMinutes: reason.durationMinutes,
      schedules: professional.schedules,
    });

    const existingAppointment = await this.prisma.appointment.findFirst({
      where: {
        professionalId,
        day,
        slot,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
      },
      select: { id: true },
    });

    if (existingAppointment) {
      throw new BadRequestException(
        'Ce créneau est déjà réservé ou en attente de confirmation.',
      );
    }

    const patientPhone = this.normalizePhoneCi(
      dto.patientPhone?.trim() || currentUser.phone,
    );

    if (!this.isValidCiPhone(patientPhone)) {
      throw new BadRequestException(
        'Téléphone patient invalide. Exemple : +2250700000001.',
      );
    }

    const patientName = this.resolvePatientName({
      authName: currentUser.name,
      firstName: dto.patientFirstName,
      lastName: dto.patientLastName,
    });

    const appointment = await this.prisma.appointment.create({
      data: {
        professionalId,
        patientName,
        patientPhone,
        day,
        slot,
        reason: reason.label,
        status: AppointmentStatus.PENDING,
        consentAccepted: true,
        consentVersion: this.optionalText(dto.consentVersion),
        consentAcceptedAt: new Date(),
      },
      include: this.appointmentInclude(),
    });

    return {
      appointment,
    };
  }

  async listMine(currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Cet endpoint est réservé aux comptes patients.',
      );
    }

    const patientPhone = this.normalizePhoneCi(currentUser.phone);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientPhone,
      },
      orderBy: [
        { day: 'asc' },
        { slot: 'asc' },
      ],
      include: this.appointmentInclude(),
    });

    return {
      items: appointments,
      count: appointments.length,
    };
  }

  async listProfessionalMine(currentUser: AuthenticatedUser) {
    if (currentUser.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Cet endpoint est réservé aux comptes professionnels.',
      );
    }

    const profile = await this.prisma.professionalProfile.findUnique({
      where: {
        userId: currentUser.id,
      },
      select: {
        id: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profil professionnel introuvable.');
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        professionalId: profile.id,
      },
      orderBy: [
        { day: 'asc' },
        { slot: 'asc' },
      ],
      include: this.appointmentInclude(),
    });

    return {
      items: appointments,
      count: appointments.length,
    };
  }

  async updateStatus(
    currentUser: AuthenticatedUser,
    appointmentId: string,
    dto: UpdateAppointmentStatusDto,
  ) {
    const id = this.cleanText(appointmentId);

    if (!id) {
      throw new BadRequestException('Identifiant rendez-vous invalide.');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        professional: true,
        teleconsultation: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable.');
    }

    await this.assertCanUpdateStatus(currentUser, appointment.professionalId, dto.status);

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: dto.status,
        },
        include: this.appointmentInclude(),
      });

      if (dto.status === AppointmentStatus.CONFIRMED) {
        await tx.teleconsultationSession.upsert({
          where: {
            appointmentId: updated.id,
          },
          create: {
            appointmentId: updated.id,
            professionalId: updated.professionalId,
            patientName: updated.patientName,
            patientPhone: updated.patientPhone,
            scheduledAt: this.combineDateAndSlot(updated.day, updated.slot),
            reason: updated.reason,
            status: TeleconsultationStatus.SCHEDULED,
            consentAccepted: false,
            roomUrl: `mock://teleconsultation/${updated.id}`,
          },
          update: {
            status: TeleconsultationStatus.SCHEDULED,
            scheduledAt: this.combineDateAndSlot(updated.day, updated.slot),
            reason: updated.reason,
            roomUrl: `mock://teleconsultation/${updated.id}`,
          },
        });
      }

      if (
        dto.status === AppointmentStatus.CANCELLED_BY_PATIENT ||
        dto.status === AppointmentStatus.CANCELLED_BY_PROFESSIONAL ||
        dto.status === AppointmentStatus.DECLINED_BY_PROFESSIONAL
      ) {
        await tx.teleconsultationSession.updateMany({
          where: {
            appointmentId: updated.id,
            status: {
              notIn: [
                TeleconsultationStatus.COMPLETED,
                TeleconsultationStatus.CANCELLED,
              ],
            },
          },
          data: {
            status: TeleconsultationStatus.CANCELLED,
            endedAt: new Date(),
          },
        });
      }

      if (dto.status === AppointmentStatus.COMPLETED) {
        await tx.teleconsultationSession.updateMany({
          where: {
            appointmentId: updated.id,
            status: {
              not: TeleconsultationStatus.CANCELLED,
            },
          },
          data: {
            status: TeleconsultationStatus.COMPLETED,
            endedAt: new Date(),
          },
        });
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id },
        include: this.appointmentInclude(),
      });
    });

    return {
      appointment: updatedAppointment,
    };
  }

  private appointmentInclude() {
    return {
      professional: {
        include: {
          appointmentReasons: {
            orderBy: { position: 'asc' as const },
          },
          schedules: {
            orderBy: { weekday: 'asc' as const },
            include: {
              slots: {
                orderBy: { position: 'asc' as const },
              },
            },
          },
        },
      },
      teleconsultation: true,
    };
  }

  private async assertCanUpdateStatus(
    currentUser: AuthenticatedUser,
    professionalId: string,
    nextStatus: AppointmentStatus,
  ) {
    if (currentUser.role === UserRole.ADMIN) {
      return;
    }

    if (currentUser.role === UserRole.PATIENT) {
      if (nextStatus !== AppointmentStatus.CANCELLED_BY_PATIENT) {
        throw new ForbiddenException(
          'Un patient peut seulement annuler son propre rendez-vous.',
        );
      }

      return;
    }

    if (currentUser.role === UserRole.PROFESSIONAL) {
      const profile = await this.prisma.professionalProfile.findUnique({
        where: {
          userId: currentUser.id,
        },
        select: {
          id: true,
        },
      });

      if (!profile || profile.id !== professionalId) {
        throw new ForbiddenException(
          'Ce rendez-vous n’appartient pas à votre profil professionnel.',
        );
      }

      const allowedStatuses = new Set<AppointmentStatus>([
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.DECLINED_BY_PROFESSIONAL,
        AppointmentStatus.CANCELLED_BY_PROFESSIONAL,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.NO_SHOW,
      ]);

      if (!allowedStatuses.has(nextStatus)) {
        throw new ForbiddenException(
          'Statut non autorisé pour un professionnel.',
        );
      }

      return;
    }

    throw new ForbiddenException('Action non autorisée.');
  }

  private assertSlotIsAvailableInSchedule(params: {
    day: Date;
    slot: string;
    durationMinutes: number;
    schedules: Array<{
      weekday: number;
      isOpen: boolean;
      slots: Array<{
        startTime: string;
        endTime: string;
      }>;
    }>;
  }) {
    const weekday = this.weekdayFromDate(params.day);
    const schedule = params.schedules.find((item) => item.weekday === weekday);

    if (!schedule || !schedule.isOpen) {
      throw new BadRequestException(
        'Ce professionnel n’est pas ouvert ce jour-là.',
      );
    }

    const startMinutes = this.toMinutes(params.slot);
    const endMinutes = startMinutes + params.durationMinutes;

    const matchingSlot = schedule.slots.find((slot) => {
      const scheduleStart = this.toMinutes(slot.startTime);
      const scheduleEnd = this.toMinutes(slot.endTime);

      return startMinutes >= scheduleStart && endMinutes <= scheduleEnd;
    });

    if (!matchingSlot) {
      throw new BadRequestException(
        'Ce créneau ne correspond pas aux disponibilités du professionnel.',
      );
    }
  }

  private weekdayFromDate(date: Date): number {
    const jsDay = date.getUTCDay();
    return jsDay === 0 ? 7 : jsDay;
  }

  private parseDateOnly(value: string): Date | null {
    const trimmed = value.trim();

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date;
  }

  private combineDateAndSlot(day: Date, slot: string): Date {
    const minutes = this.toMinutes(slot);

    return new Date(
      Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        Math.floor(minutes / 60),
        minutes % 60,
      ),
    );
  }

  private normalizeSlot(value: string): string {
    const trimmed = value.trim();

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      throw new BadRequestException(
        'Créneau invalide. Format attendu : HH:mm.',
      );
    }

    return trimmed;
  }

  private toMinutes(value: string): number {
    const normalized = this.normalizeSlot(value);
    const [hh, mm] = normalized.split(':').map(Number);
    return hh * 60 + mm;
  }

  private resolvePatientName(params: {
    authName: string;
    firstName?: string;
    lastName?: string;
  }): string {
    const firstName = this.cleanText(params.firstName ?? '');
    const lastName = this.cleanText(params.lastName ?? '');
    const fromParts = [firstName, lastName].filter(Boolean).join(' ');

    if (fromParts) return fromParts;

    const authName = this.cleanText(params.authName);
    return authName || 'Patient';
  }

  private normalizePhoneCi(value: string): string {
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

  private isValidCiPhone(value: string): boolean {
    return /^\+225\d{10}$/.test(value);
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private optionalText(value?: string): string | null {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length === 0 ? null : cleaned;
  }

  private normalizeLoose(value: string): string {
    return value.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');
  }
}