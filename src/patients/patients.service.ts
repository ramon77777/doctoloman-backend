import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

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
      dto.phone === undefined ? existing.phone : this.normalizePhoneCi(dto.phone);

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

  private isValidCiPhone(value: string): boolean {
    return /^\+225\d{10}$/.test(value);
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
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