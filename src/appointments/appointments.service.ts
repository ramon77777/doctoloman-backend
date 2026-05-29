import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  NotificationType,
  TeleconsultationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MINIMUM_LEAD_TIME_MINUTES = 60;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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
      (item) =>
        this.normalizeLoose(item.label) === this.normalizeLoose(reasonLabel),
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

    await this.notifyProfessionalAppointmentRequested(appointment);

    return {
      appointment,
    };
  }

  async listForCurrentUser(
    currentUser: AuthenticatedUser,
    query: {
      practitionerId?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const page = Math.max(Number(query.page ?? 1) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number(query.pageSize ?? 50) || 50, 1),
      500,
    );

    const where: Record<string, unknown> = {};

    if (currentUser.role === UserRole.PATIENT) {
      where.patientPhone = this.normalizePhoneCi(currentUser.phone);
    } else if (currentUser.role === UserRole.PROFESSIONAL) {
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

      where.professionalId = profile.id;
    } else if (currentUser.role === UserRole.ADMIN) {
      const practitionerId = this.cleanText(query.practitionerId ?? '');
      if (practitionerId) {
        where.professionalId = practitionerId;
      }
    } else {
      throw new ForbiddenException('Action non autorisée.');
    }

    const normalizedStatus = this.normalizeAppointmentStatus(query.status);
    if (normalizedStatus) {
      where.status = normalizedStatus;
    }

    const dateFilter: Record<string, Date> = {};

    const from = this.parseDateTimeOrDateOnly(query.from ?? '');
    if (from) {
      dateFilter.gte = from;
    }

    const to = this.parseDateTimeOrDateOnly(query.to ?? '');
    if (to) {
      dateFilter.lt = to;
    }

    if (Object.keys(dateFilter).length > 0) {
      where.day = dateFilter;
    }

    const [appointments, totalCount] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        orderBy: [{ day: 'asc' }, { slot: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.appointmentInclude(),
      }),
      this.prisma.appointment.count({
        where,
      }),
    ]);

    return {
      items: appointments,
      totalCount,
      count: appointments.length,
      page,
      pageSize,
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
      orderBy: [{ day: 'asc' }, { slot: 'asc' }],
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
      orderBy: [{ day: 'asc' }, { slot: 'asc' }],
      include: this.appointmentInclude(),
    });

    return {
      items: appointments,
      count: appointments.length,
    };
  }

  async reschedule(
    currentUser: AuthenticatedUser,
    appointmentId: string,
    body: {
      day?: string;
      slot?: string;
    },
  ) {
    if (currentUser.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Seul le patient peut reprogrammer son rendez-vous depuis cet endpoint.',
      );
    }

    const id = this.cleanText(appointmentId);
    if (!id) {
      throw new BadRequestException('Identifiant rendez-vous invalide.');
    }

    const day = this.parseDateOnly(body.day ?? '');
    if (!day) {
      throw new BadRequestException('Date invalide.');
    }

    const slot = this.normalizeSlot(body.slot ?? '');
    const scheduledAt = this.combineDateAndSlot(day, slot);

    if (
      scheduledAt.getTime() <=
      Date.now() + MINIMUM_LEAD_TIME_MINUTES * 60 * 1000
    ) {
      throw new BadRequestException(
        'Ce créneau est trop proche. La réservation doit se faire au moins 1h à l’avance.',
      );
    }

    const patientPhone = this.normalizePhoneCi(currentUser.phone);

    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        professional: {
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
        },
        teleconsultation: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable.');
    }

    if (this.normalizePhoneCi(appointment.patientPhone) !== patientPhone) {
      throw new ForbiddenException(
        'Vous ne pouvez reprogrammer que vos propres rendez-vous.',
      );
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED_BY_PATIENT ||
      appointment.status === AppointmentStatus.CANCELLED_BY_PROFESSIONAL ||
      appointment.status === AppointmentStatus.DECLINED_BY_PROFESSIONAL ||
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'Ce rendez-vous ne peut plus être reprogrammé.',
      );
    }

    const reason = appointment.professional.appointmentReasons.find(
      (item) =>
        this.normalizeLoose(item.label) ===
        this.normalizeLoose(appointment.reason),
    );

    const durationMinutes =
      reason?.durationMinutes ??
      appointment.professional.appointmentDurationMinutes ??
      30;

    this.assertSlotIsAvailableInSchedule({
      day,
      slot,
      durationMinutes,
      schedules: appointment.professional.schedules,
    });

    const existingAppointment = await this.prisma.appointment.findFirst({
      where: {
        id: {
          not: appointment.id,
        },
        professionalId: appointment.professionalId,
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

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          day,
          slot,
          status: AppointmentStatus.PENDING,
        },
        include: this.appointmentInclude(),
      });

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

      return tx.appointment.findUniqueOrThrow({
        where: { id },
        include: this.appointmentInclude(),
      });
    });

    return {
      appointment: updatedAppointment,
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

    if (
      currentUser.role === UserRole.PATIENT &&
      this.normalizePhoneCi(appointment.patientPhone) !==
        this.normalizePhoneCi(currentUser.phone)
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez annuler que vos propres rendez-vous.',
      );
    }

    await this.assertCanUpdateStatus(
      currentUser,
      appointment.professionalId,
      dto.status,
    );

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

    if (dto.status === AppointmentStatus.CANCELLED_BY_PATIENT) {
      await this.notifyProfessionalAppointmentCancelledByPatient(
        updatedAppointment,
      );
    } else {
      await this.notifyPatientAppointmentStatusChanged(
        updatedAppointment,
        dto.status,
      );
    }

    return {
      appointment: updatedAppointment,
    };
  }

  private async notifyProfessionalAppointmentRequested(appointment: {
    id: string;
    professionalId: string;
    patientName: string;
    patientPhone: string;
    day: Date;
    slot: string;
    reason: string;
    professional?: {
      userId?: string | null;
      displayName?: string | null;
    } | null;
  }) {
    const professionalUserId =
      appointment.professional?.userId ??
      (await this.findProfessionalUserId(appointment.professionalId));

    if (!professionalUserId) {
      return;
    }

    await this.safeCreateNotification({
      userId: professionalUserId,
      type: NotificationType.APPOINTMENT_REQUESTED,
      title: 'Docto’Loman',
      message: `Nouvelle demande de rendez-vous de ${appointment.patientName}.`,
      data: {
        appointmentId: appointment.id,
        status: AppointmentStatus.PENDING,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        reason: appointment.reason,
        day: appointment.day.toISOString(),
        slot: appointment.slot,
      },
    });
  }

  private async notifyProfessionalAppointmentCancelledByPatient(appointment: {
    id: string;
    professionalId: string;
    patientName: string;
    patientPhone: string;
    day: Date;
    slot: string;
    reason: string;
    professional?: {
      userId?: string | null;
      displayName?: string | null;
    } | null;
  }) {
    const professionalUserId =
      appointment.professional?.userId ??
      (await this.findProfessionalUserId(appointment.professionalId));

    if (!professionalUserId) {
      return;
    }

    await this.safeCreateNotification({
      userId: professionalUserId,
      type: NotificationType.APPOINTMENT_CANCELLED,
      title: 'Docto’Loman',
      message: `${appointment.patientName} a annulé son rendez-vous.`,
      data: {
        appointmentId: appointment.id,
        status: AppointmentStatus.CANCELLED_BY_PATIENT,
        patientName: appointment.patientName,
        patientPhone: appointment.patientPhone,
        reason: appointment.reason,
        day: appointment.day.toISOString(),
        slot: appointment.slot,
      },
    });
  }
  
  private async notifyPatientAppointmentStatusChanged(
    appointment: {
      id: string;
      professionalId: string;
      patientName: string;
      patientPhone: string;
      day: Date;
      slot: string;
      reason: string;
      professional?: {
        displayName?: string | null;
      } | null;
    },
    status: AppointmentStatus,
  ) {
    const patientUserId = await this.findPatientUserIdByPhone(
      appointment.patientPhone,
    );

    if (!patientUserId) {
      return;
    }

    const professionalName =
      this.cleanText(appointment.professional?.displayName ?? '') ||
      'votre professionnel de santé';

    if (status === AppointmentStatus.CONFIRMED) {
      await this.safeCreateNotification({
        userId: patientUserId,
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Docto’Loman',
        message: `Votre rendez-vous avec ${professionalName} a été confirmé.`,
        data: {
          appointmentId: appointment.id,
          status,
          professionalName,
          reason: appointment.reason,
          day: appointment.day.toISOString(),
          slot: appointment.slot,
        },
      });

      return;
    }

    if (
      status === AppointmentStatus.DECLINED_BY_PROFESSIONAL ||
      status === AppointmentStatus.CANCELLED_BY_PROFESSIONAL
    ) {
      await this.safeCreateNotification({
        userId: patientUserId,
        type: NotificationType.APPOINTMENT_CANCELLED,
        title: 'Docto’Loman',
        message:
          status === AppointmentStatus.DECLINED_BY_PROFESSIONAL
            ? `Votre demande de rendez-vous avec ${professionalName} a été refusée.`
            : `Votre rendez-vous avec ${professionalName} a été annulé.`,
        data: {
          appointmentId: appointment.id,
          status,
          professionalName,
          reason: appointment.reason,
          day: appointment.day.toISOString(),
          slot: appointment.slot,
        },
      });
    }
  }

  private async findProfessionalUserId(professionalId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      select: { userId: true },
    });

    return professional?.userId ?? null;
  }

  private async findPatientUserIdByPhone(patientPhone: string) {
    const normalizedPhone = this.normalizePhoneCi(patientPhone);

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
        'DoctoLoman appointments notifications - création notification impossible:',
        error,
      );
    }
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

  private normalizeAppointmentStatus(value?: string): AppointmentStatus | null {
    const normalized = this.cleanText(value ?? '');

    if (!normalized) {
      return null;
    }

    switch (normalized) {
      case 'pending':
      case 'PENDING':
        return AppointmentStatus.PENDING;

      case 'confirmed':
      case 'CONFIRMED':
        return AppointmentStatus.CONFIRMED;

      case 'cancelledByPatient':
      case 'CANCELLED_BY_PATIENT':
        return AppointmentStatus.CANCELLED_BY_PATIENT;

      case 'cancelledByProfessional':
      case 'CANCELLED_BY_PROFESSIONAL':
        return AppointmentStatus.CANCELLED_BY_PROFESSIONAL;

      case 'declinedByProfessional':
      case 'DECLINED_BY_PROFESSIONAL':
      case 'declined':
      case 'DECLINED':
        return AppointmentStatus.DECLINED_BY_PROFESSIONAL;

      case 'completed':
      case 'COMPLETED':
      case 'done':
      case 'DONE':
        return AppointmentStatus.COMPLETED;

      case 'noShow':
      case 'NO_SHOW':
        return AppointmentStatus.NO_SHOW;

      default:
        throw new BadRequestException('Statut de rendez-vous invalide.');
    }
  }

  private parseDateTimeOrDateOnly(value: string): Date | null {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const dateOnly = this.parseDateOnly(trimmed);
    if (dateOnly) {
      return dateOnly;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
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
