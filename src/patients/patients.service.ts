import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async me(user: AuthenticatedUser) {
    this.ensurePatient(user);

    const patientProfile = await this.getOrCreatePatientProfile(user.id);

    return {
      patientProfile,
    };
  }

  async updateMe(user: AuthenticatedUser, dto: UpdatePatientProfileDto) {
    this.ensurePatient(user);

    const existing = await this.getOrCreatePatientProfile(user.id);

    const firstName =
      dto.firstName === undefined
        ? existing.firstName
        : this.cleanText(dto.firstName);

    const lastName =
      dto.lastName === undefined
        ? existing.lastName
        : this.cleanText(dto.lastName);

    const phone =
      dto.phone === undefined
        ? existing.phone
        : this.normalizePhoneCi(dto.phone);

    if (!firstName) {
      throw new BadRequestException('Prénom requis.');
    }

    if (!lastName) {
      throw new BadRequestException('Nom requis.');
    }

    if (!phone) {
      throw new BadRequestException('Téléphone requis.');
    }

    if (!this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000001.',
      );
    }

    const emergencyContactPhone =
      dto.emergencyContactPhone === undefined
        ? existing.emergencyContactPhone
        : this.optionalPhone(dto.emergencyContactPhone);

    if (emergencyContactPhone && !this.isValidCiPhone(emergencyContactPhone)) {
      throw new BadRequestException(
        'Format téléphone du contact d’urgence invalide. Exemple : +2250700000002.',
      );
    }

    const birthDate =
      dto.birthDate === undefined
        ? existing.birthDate
        : this.parseOptionalDate(dto.birthDate);

    const phoneOwner = await this.prisma.user.findUnique({
      where: {
        phone,
      },
      select: {
        id: true,
      },
    });

    if (phoneOwner && phoneOwner.id !== user.id) {
      throw new ConflictException('Ce téléphone est déjà utilisé.');
    }

    const fullName = this.buildFullName(firstName, lastName);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          name: fullName,
          phone,
        },
      });

      return tx.patientProfile.update({
        where: {
          id: existing.id,
        },
        data: {
          firstName,
          lastName,
          phone,

          city:
            dto.city === undefined
              ? existing.city
              : this.optionalText(dto.city),

          district:
            dto.district === undefined
              ? existing.district
              : this.optionalText(dto.district),

          address:
            dto.address === undefined
              ? existing.address
              : this.optionalText(dto.address),

          birthDate,

          gender:
            dto.gender === undefined
              ? existing.gender
              : this.optionalText(dto.gender),

          bloodGroup:
            dto.bloodGroup === undefined
              ? existing.bloodGroup
              : this.optionalText(dto.bloodGroup),

          allergies:
            dto.allergies === undefined
              ? existing.allergies
              : this.optionalMultilineText(dto.allergies),

          medicalNotes:
            dto.medicalNotes === undefined
              ? existing.medicalNotes
              : this.optionalMultilineText(dto.medicalNotes),

          emergencyContactName:
            dto.emergencyContactName === undefined
              ? existing.emergencyContactName
              : this.optionalText(dto.emergencyContactName),

          emergencyContactPhone,
        },
      });
    });

    return {
      patientProfile: updated,
    };
  }

  private ensurePatient(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Cette action est réservée aux comptes patients.',
      );
    }
  }

  private async getOrCreatePatientProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        patientProfile: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Cette action est réservée aux comptes patients.',
      );
    }

    if (user.patientProfile) {
      return user.patientProfile;
    }

    const firstName = this.extractFirstName(user.name);
    const lastName = this.extractLastName(user.name);

    return this.prisma.patientProfile.create({
      data: {
        userId: user.id,
        firstName,
        lastName,
        phone: user.phone,
      },
    });
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

  private optionalPhone(value?: string | null): string | null {
    const normalized = this.normalizePhoneCi(value ?? '');
    return normalized.length === 0 ? null : normalized;
  }

  private isValidCiPhone(value: string): boolean {
    return /^\+225\d{10}$/.test(value);
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private optionalText(value?: string | null): string | null {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length === 0 ? null : cleaned;
  }

  private optionalMultilineText(value?: string | null): string | null {
    const cleaned = (value ?? '')
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    return cleaned.length === 0 ? null : cleaned;
  }

  private parseOptionalDate(value?: string | null): Date | null {
    const raw = (value ?? '').trim();

    if (!raw) {
      return null;
    }

    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'Date de naissance invalide. Format attendu : YYYY-MM-DD.',
      );
    }

    return parsed;
  }

  private buildFullName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim().replace(/\s+/g, ' ');
  }

  private extractFirstName(fullName: string): string {
    const parts = this.cleanText(fullName).split(' ');
    return parts[0] || 'Utilisateur';
  }

  private extractLastName(fullName: string): string {
    const parts = this.cleanText(fullName).split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
}
