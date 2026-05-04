import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MedicalRecordType, UserRole } from '@prisma/client';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicalRecordDto } from './dto/create-medical-record.dto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';

@Injectable()
export class MedicalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    user: AuthenticatedUser,
    dto: CreateMedicalRecordDto,
    file?: Express.Multer.File,
  ) {
    this.ensurePatient(user);

    if (!file) {
      throw new BadRequestException('Fichier médical requis.');
    }

    const title = this.cleanText(dto.title);
    const description = this.optionalText(dto.description);
    const type = dto.type ?? MedicalRecordType.OTHER;

    if (!title) {
      throw new BadRequestException('Titre requis.');
    }

    const record = await this.prisma.medicalRecord.create({
      data: {
        patientId: user.id,
        title,
        type,
        description,
        originalFileName: file.originalname,
        storedFileName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        filePath: this.normalizeFilePath(file.path),
      },
    });

    return {
      medicalRecord: record,
    };
  }

  async listMine(user: AuthenticatedUser) {
    this.ensurePatient(user);

    const items = await this.prisma.medicalRecord.findMany({
      where: {
        patientId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      items,
      count: items.length,
    };
  }

  async findMine(user: AuthenticatedUser, id: string) {
    this.ensurePatient(user);

    const record = await this.prisma.medicalRecord.findFirst({
      where: {
        id: id.trim(),
        patientId: user.id,
      },
    });

    if (!record) {
      throw new NotFoundException('Document médical introuvable.');
    }

    return record;
  }

  async getDownloadInfo(user: AuthenticatedUser, id: string) {
    const record = await this.findMine(user, id);

    const absolutePath = this.resolveStoredPath(record.filePath);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(
        'Le fichier associé à ce document est introuvable.',
      );
    }

    return {
      record,
      absolutePath,
    };
  }

  async deleteMine(user: AuthenticatedUser, id: string) {
    const record = await this.findMine(user, id);

    await this.prisma.medicalRecord.delete({
      where: {
        id: record.id,
      },
    });

    const absolutePath = this.resolveStoredPath(record.filePath);

    if (existsSync(absolutePath)) {
      await unlink(absolutePath).catch(() => undefined);
    }

    return {
      deleted: true,
      id: record.id,
    };
  }

  private ensurePatient(user: AuthenticatedUser) {
    if (user.role !== UserRole.PATIENT) {
      throw new ForbiddenException(
        'Cette action est réservée au patient propriétaire du dossier.',
      );
    }
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private optionalText(value?: string): string | null {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length === 0 ? null : cleaned;
  }

  private normalizeFilePath(value: string): string {
    return value.replace(/\\/g, '/');
  }

  private resolveStoredPath(filePath: string): string {
    const uploadRoot = resolve(process.cwd(), 'uploads');
    const absolutePath = resolve(process.cwd(), filePath);

    if (!absolutePath.startsWith(uploadRoot)) {
      throw new ForbiddenException('Chemin de fichier invalide.');
    }

    return absolutePath;
  }
}