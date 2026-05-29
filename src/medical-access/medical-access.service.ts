import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicalAccessAuditAction, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { GrantMedicalAccessDto } from './dto/grant-medical-access.dto';

@Injectable()
export class MedicalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async grantAccess(user: AuthenticatedUser, dto: GrantMedicalAccessDto) {
    this.ensurePatient(user);

    const professionalId = this.cleanText(dto.professionalId);
    if (!professionalId) {
      throw new BadRequestException('Professionnel requis.');
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalId },
      include: { user: true },
    });

    if (!professional || !professional.user.isActive) {
      throw new NotFoundException('Professionnel introuvable.');
    }

    const access = await this.prisma.medicalAccess.upsert({
      where: {
        patientId_professionalId: {
          patientId: user.id,
          professionalId,
        },
      },
      create: {
        patientId: user.id,
        professionalId,
        grantedAt: new Date(),
        revokedAt: null,
      },
      update: {
        grantedAt: new Date(),
        revokedAt: null,
      },
      include: this.accessInclude(),
    });

    await this.logAudit({
      action: MedicalAccessAuditAction.GRANT_ACCESS,
      patientId: user.id,
      professionalId,
      medicalAccessId: access.id,
    });

    return {
      medicalAccess: access,
    };
  }

  async revokeAccess(user: AuthenticatedUser, accessId: string) {
    this.ensurePatient(user);

    const id = this.cleanText(accessId);
    if (!id) {
      throw new BadRequestException('Identifiant accès invalide.');
    }

    const access = await this.prisma.medicalAccess.findFirst({
      where: {
        id,
        patientId: user.id,
      },
    });

    if (!access) {
      throw new NotFoundException('Autorisation introuvable.');
    }

    const updated = await this.prisma.medicalAccess.update({
      where: { id: access.id },
      data: {
        revokedAt: new Date(),
      },
      include: this.accessInclude(),
    });

    await this.logAudit({
      action: MedicalAccessAuditAction.REVOKE_ACCESS,
      patientId: updated.patientId,
      professionalId: updated.professionalId,
      medicalAccessId: updated.id,
    });

    return {
      medicalAccess: updated,
    };
  }

  async listForPatient(user: AuthenticatedUser) {
    this.ensurePatient(user);

    const items = await this.prisma.medicalAccess.findMany({
      where: {
        patientId: user.id,
      },
      orderBy: {
        grantedAt: 'desc',
      },
      include: this.accessInclude(),
    });

    return {
      items,
      count: items.length,
    };
  }

  async listForProfessional(user: AuthenticatedUser) {
    const professional = await this.getCurrentProfessionalProfile(user);

    const items = await this.prisma.medicalAccess.findMany({
      where: {
        professionalId: professional.id,
        revokedAt: null,
      },
      orderBy: {
        grantedAt: 'desc',
      },
      include: this.accessInclude(),
    });

    return {
      items,
      count: items.length,
    };
  }

  async listAuditForPatient(user: AuthenticatedUser) {
    this.ensurePatient(user);

    const items = await this.prisma.medicalAccessAudit.findMany({
      where: {
        patientId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        professional: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        medicalRecord: true,
      },
    });

    return {
      items,
      count: items.length,
    };
  }

  async assertProfessionalCanAccessPatient(
    user: AuthenticatedUser,
    patientId: string,
  ) {
    const professional = await this.getCurrentProfessionalProfile(user);
    const normalizedPatientId = this.cleanText(patientId);

    if (!normalizedPatientId) {
      throw new BadRequestException('Patient requis.');
    }

    const patient = await this.prisma.user.findFirst({
      where: {
        id: normalizedPatientId,
        role: UserRole.PATIENT,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }

    const access = await this.prisma.medicalAccess.findFirst({
      where: {
        patientId: patient.id,
        professionalId: professional.id,
        revokedAt: null,
      },
    });

    if (!access) {
      throw new ForbiddenException(
        'Accès non autorisé ou révoqué pour ce dossier patient.',
      );
    }

    return {
      access,
      patient,
      professional,
    };
  }

  async logProfessionalOpenPatientRecords(params: {
    user: AuthenticatedUser;
    patientId: string;
  }) {
    const { access, professional } =
      await this.assertProfessionalCanAccessPatient(
        params.user,
        params.patientId,
      );

    await this.logAudit({
      action: MedicalAccessAuditAction.OPEN_PATIENT_MEDICAL_RECORDS,
      patientId: access.patientId,
      professionalId: professional.id,
      medicalAccessId: access.id,
    });
  }

  async logProfessionalOpenMedicalRecord(params: {
    user: AuthenticatedUser;
    patientId: string;
    medicalRecordId: string;
    medicalRecordTitle: string;
    isDownload: boolean;
  }) {
    const { access, professional } =
      await this.assertProfessionalCanAccessPatient(
        params.user,
        params.patientId,
      );

    await this.logAudit({
      action: params.isDownload
        ? MedicalAccessAuditAction.DOWNLOAD_MEDICAL_RECORD
        : MedicalAccessAuditAction.OPEN_MEDICAL_RECORD,
      patientId: access.patientId,
      professionalId: professional.id,
      medicalAccessId: access.id,
      medicalRecordId: params.medicalRecordId,
      medicalRecordTitle: params.medicalRecordTitle,
    });
  }

  private async getCurrentProfessionalProfile(user: AuthenticatedUser) {
    if (user.role !== UserRole.PROFESSIONAL) {
      throw new ForbiddenException(
        'Cette action est réservée aux professionnels de santé.',
      );
    }

    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        userId: user.id,
      },
      include: {
        user: true,
      },
    });

    if (!professional || !professional.user.isActive) {
      throw new NotFoundException('Profil professionnel introuvable.');
    }

    return professional;
  }

  private ensurePatient(user: AuthenticatedUser) {
    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Cette action est réservée au patient propriétaire du dossier.',
      );
    }
  }

  private async logAudit(params: {
    action: MedicalAccessAuditAction;
    patientId: string;
    professionalId: string;
    medicalAccessId?: string;
    medicalRecordId?: string;
    medicalRecordTitle?: string;
  }) {
    await this.prisma.medicalAccessAudit.create({
      data: {
        action: params.action,
        patientId: params.patientId,
        professionalId: params.professionalId,
        medicalAccessId: params.medicalAccessId,
        medicalRecordId: params.medicalRecordId,
        medicalRecordTitle: params.medicalRecordTitle,
      },
    });
  }

  private accessInclude() {
    return {
      patient: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      professional: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      },
    };
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }
}
