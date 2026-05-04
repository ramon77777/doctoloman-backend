import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ProfessionalSearchQueryDto } from './dto/professional-search-query.dto';
import { UpdateProfessionalProfileDto } from './dto/update-professional-profile.dto';
import { UpdateProfessionalReasonsDto } from './dto/update-professional-reasons.dto';
import { UpdateProfessionalSchedulesDto } from './dto/update-professional-schedules.dto';

@Injectable()
export class ProfessionalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(query: ProfessionalSearchQueryDto) {
    const q = this.cleanOptional(query.q);
    const specialty = this.cleanOptional(query.specialty);
    const city = this.cleanOptional(query.city);
    const area = this.cleanOptional(query.area);

    const professionals = await this.prisma.professionalProfile.findMany({
      where: {
        user: {
          isActive: true,
        },
        ...(specialty
          ? {
              specialty: {
                contains: specialty,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(city
          ? {
              city: {
                contains: city,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(area
          ? {
              area: {
                contains: area,
                mode: 'insensitive',
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                {
                  displayName: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
                {
                  specialty: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
                {
                  structureName: {
                    contains: q,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      include: this.professionalInclude(),
      orderBy: [
        {
          isVerified: 'desc',
        },
        {
          displayName: 'asc',
        },
      ],
    });

    return {
      items: professionals.map((item) => this.toPublicProfessional(item)),
      count: professionals.length,
    };
  }

  async getPublicById(id: string) {
    const professionalId = this.cleanText(id);

    if (!professionalId) {
      throw new BadRequestException('Identifiant professionnel invalide.');
    }

    const professional = await this.prisma.professionalProfile.findFirst({
      where: {
        id: professionalId,
        user: {
          isActive: true,
        },
      },
      include: this.professionalInclude(),
    });

    if (!professional) {
      throw new NotFoundException('Professionnel introuvable.');
    }

    return this.toPublicProfessional(professional);
  }

  async getMe(currentUser: AuthenticatedUser) {
    this.ensureProfessional(currentUser);

    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        userId: currentUser.id,
      },
      include: this.professionalInclude(),
    });

    if (!professional) {
      throw new NotFoundException('Profil professionnel introuvable.');
    }

    return {
      professionalProfile: this.toProfessionalProfile(professional),
    };
  }

  async updateMe(
    currentUser: AuthenticatedUser,
    dto: UpdateProfessionalProfileDto,
  ) {
    this.ensureProfessional(currentUser);

    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        userId: currentUser.id,
      },
      select: {
        id: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Profil professionnel introuvable.');
    }

    const phone =
      dto.phone === undefined ? undefined : this.normalizePhoneCi(dto.phone);

    if (phone !== undefined && !this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000002.',
      );
    }

    const displayName =
      dto.displayName === undefined
        ? undefined
        : this.requiredText(dto.displayName, 'Nom affiché requis.');

    const specialty =
      dto.specialty === undefined
        ? undefined
        : this.requiredText(dto.specialty, 'Spécialité requise.');

    const updated = await this.prisma.professionalProfile.update({
      where: {
        id: professional.id,
      },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(specialty !== undefined ? { specialty } : {}),
        ...(dto.structureName !== undefined
          ? { structureName: this.optionalText(dto.structureName) }
          : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(dto.city !== undefined ? { city: this.optionalText(dto.city) } : {}),
        ...(dto.area !== undefined ? { area: this.optionalText(dto.area) } : {}),
        ...(dto.address !== undefined
          ? { address: this.optionalText(dto.address) }
          : {}),
        ...(dto.bio !== undefined ? { bio: this.optionalMultiline(dto.bio) } : {}),
        ...(dto.consultationFeeLabel !== undefined
          ? { consultationFeeLabel: this.optionalText(dto.consultationFeeLabel) }
          : {}),
        ...(dto.appointmentDurationMinutes !== undefined
          ? { appointmentDurationMinutes: dto.appointmentDurationMinutes }
          : {}),
        ...(dto.isVerified !== undefined ? { isVerified: dto.isVerified } : {}),
      },
      include: this.professionalInclude(),
    });

    return {
      professionalProfile: this.toProfessionalProfile(updated),
    };
  }

  async replaceMyReasons(
    currentUser: AuthenticatedUser,
    dto: UpdateProfessionalReasonsDto,
  ) {
    this.ensureProfessional(currentUser);

    const professional = await this.getCurrentProfessionalOrThrow(currentUser.id);

    const normalizedReasons = dto.reasons.map((reason, index) => ({
      label: this.requiredText(reason.label, 'Libellé du motif requis.'),
      durationMinutes: reason.durationMinutes,
      position: reason.position ?? index,
      isActive: reason.isActive ?? true,
    }));

    this.ensureUniqueLabels(normalizedReasons.map((reason) => reason.label));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.appointmentReason.deleteMany({
        where: {
          professionalId: professional.id,
        },
      });

      await tx.appointmentReason.createMany({
        data: normalizedReasons.map((reason) => ({
          professionalId: professional.id,
          label: reason.label,
          durationMinutes: reason.durationMinutes,
          position: reason.position,
          isActive: reason.isActive,
        })),
      });

      return tx.professionalProfile.findUniqueOrThrow({
        where: {
          id: professional.id,
        },
        include: this.professionalInclude(),
      });
    });

    return {
      professionalProfile: this.toProfessionalProfile(updated),
    };
  }

  async replaceMySchedules(
    currentUser: AuthenticatedUser,
    dto: UpdateProfessionalSchedulesDto,
  ) {
    this.ensureProfessional(currentUser);

    const professional = await this.getCurrentProfessionalOrThrow(currentUser.id);

    this.ensureUniqueWeekdays(dto.schedules.map((day) => day.weekday));

    const normalizedSchedules = dto.schedules
      .map((day) => ({
        weekday: day.weekday,
        label: this.requiredText(day.label, 'Libellé du jour requis.'),
        isOpen: day.isOpen,
        slots: day.slots.map((slot, index) => ({
          startTime: this.normalizeHour(slot.startTime),
          endTime: this.normalizeHour(slot.endTime),
          position: slot.position ?? index,
        })),
      }))
      .sort((a, b) => a.weekday - b.weekday);

    for (const day of normalizedSchedules) {
      this.validateSlots(day.slots, day.label);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingSchedules = await tx.professionalSchedule.findMany({
        where: {
          professionalId: professional.id,
        },
        select: {
          id: true,
          weekday: true,
        },
      });

      const existingByWeekday = new Map(
        existingSchedules.map((schedule) => [schedule.weekday, schedule]),
      );

      for (const day of normalizedSchedules) {
        const existing = existingByWeekday.get(day.weekday);

        const schedule = existing
          ? await tx.professionalSchedule.update({
              where: {
                id: existing.id,
              },
              data: {
                label: day.label,
                isOpen: day.isOpen,
              },
            })
          : await tx.professionalSchedule.create({
              data: {
                professionalId: professional.id,
                weekday: day.weekday,
                label: day.label,
                isOpen: day.isOpen,
              },
            });

        await tx.professionalScheduleSlot.deleteMany({
          where: {
            scheduleId: schedule.id,
          },
        });

        if (day.isOpen && day.slots.length > 0) {
          await tx.professionalScheduleSlot.createMany({
            data: day.slots.map((slot) => ({
              scheduleId: schedule.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              position: slot.position,
            })),
          });
        }
      }

      return tx.professionalProfile.findUniqueOrThrow({
        where: {
          id: professional.id,
        },
        include: this.professionalInclude(),
      });
    });

    return {
      professionalProfile: this.toProfessionalProfile(updated),
    };
  }

  private professionalInclude() {
    return {
      appointmentReasons: {
        where: {
          isActive: true,
        },
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
    };
  }

  private async getCurrentProfessionalOrThrow(userId: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Profil professionnel introuvable.');
    }

    return professional;
  }

  private ensureProfessional(currentUser: AuthenticatedUser) {
    if (!currentUser || currentUser.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Accès réservé aux comptes professionnels.',
      );
    }
  }

  private toPublicProfessional(professional: any) {
    return {
      id: professional.id,
      displayName: professional.displayName,
      specialty: professional.specialty,
      structureName: professional.structureName,
      phone: professional.phone,
      city: professional.city,
      area: professional.area,
      address: professional.address,
      bio: professional.bio,
      consultationFeeLabel: professional.consultationFeeLabel,
      isVerified: professional.isVerified,
      appointmentDurationMinutes: professional.appointmentDurationMinutes,
      appointmentReasons: professional.appointmentReasons ?? [],
      schedules: professional.schedules ?? [],
      createdAt: professional.createdAt,
      updatedAt: professional.updatedAt,
    };
  }

  private toProfessionalProfile(professional: any) {
    return this.toPublicProfessional(professional);
  }

  private ensureUniqueLabels(labels: string[]) {
    const seen = new Set<string>();

    for (const label of labels) {
      const key = label.toLowerCase();

      if (seen.has(key)) {
        throw new BadRequestException(
          `Le motif "${label}" est présent plusieurs fois.`,
        );
      }

      seen.add(key);
    }
  }

  private ensureUniqueWeekdays(weekdays: number[]) {
    const seen = new Set<number>();

    for (const weekday of weekdays) {
      if (seen.has(weekday)) {
        throw new BadRequestException(
          `Le jour ${weekday} est présent plusieurs fois.`,
        );
      }

      seen.add(weekday);
    }
  }

  private validateSlots(
    slots: Array<{
      startTime: string;
      endTime: string;
      position: number;
    }>,
    dayLabel: string,
  ) {
    const sorted = [...slots].sort((a, b) => {
      return this.toMinutes(a.startTime) - this.toMinutes(b.startTime);
    });

    for (let i = 0; i < sorted.length; i += 1) {
      const slot = sorted[i];
      const start = this.toMinutes(slot.startTime);
      const end = this.toMinutes(slot.endTime);

      if (start >= end) {
        throw new BadRequestException(
          `Créneau invalide pour ${dayLabel} : ${slot.startTime} doit être avant ${slot.endTime}.`,
        );
      }

      const previous = sorted[i - 1];

      if (previous) {
        const previousEnd = this.toMinutes(previous.endTime);

        if (start < previousEnd) {
          throw new BadRequestException(
            `Créneaux qui se chevauchent pour ${dayLabel}.`,
          );
        }
      }
    }
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

  private requiredText(value: string, message: string): string {
    const cleaned = this.cleanText(value);

    if (!cleaned) {
      throw new BadRequestException(message);
    }

    return cleaned;
  }

  private cleanOptional(value?: string): string | undefined {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length === 0 ? undefined : cleaned;
  }

  private optionalText(value?: string): string | null {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length === 0 ? null : cleaned;
  }

  private optionalMultiline(value?: string): string | null {
    const cleaned = (value ?? '')
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    return cleaned.length === 0 ? null : cleaned;
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private normalizeHour(value: string): string {
    const trimmed = value.trim();
    const [rawHour, rawMinute] = trimmed.split(':');

    const hour = Number(rawHour);
    const minute = Number(rawMinute);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new BadRequestException(`Heure invalide : ${value}.`);
    }

    return `${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}`;
  }

  private toMinutes(value: string): number {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }
}