import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './types/authenticated-user.type';

const DEFAULT_APPOINTMENT_REASONS = [
  {
    label: 'Consultation',
    durationMinutes: 30,
    position: 0,
  },
  {
    label: 'Suivi',
    durationMinutes: 20,
    position: 1,
  },
  {
    label: 'Renouvellement ordonnance',
    durationMinutes: 15,
    position: 2,
  },
  {
    label: 'Urgence légère',
    durationMinutes: 15,
    position: 3,
  },
  {
    label: 'Autre',
    durationMinutes: 30,
    position: 4,
  },
];

const DEFAULT_WEEKLY_SCHEDULE = [
  { weekday: 1, label: 'Lundi', isOpen: true },
  { weekday: 2, label: 'Mardi', isOpen: true },
  { weekday: 3, label: 'Mercredi', isOpen: true },
  { weekday: 4, label: 'Jeudi', isOpen: true },
  { weekday: 5, label: 'Vendredi', isOpen: true },
  { weekday: 6, label: 'Samedi', isOpen: false },
  { weekday: 7, label: 'Dimanche', isOpen: false },
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const phone = this.normalizePhoneCi(dto.phone);
    const name = this.cleanText(dto.name);
    const role = dto.role ?? UserRole.PATIENT;

    if (!phone) {
      throw new BadRequestException('Téléphone requis.');
    }

    if (!this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000001.',
      );
    }

    if (!name) {
      throw new BadRequestException('Nom requis.');
    }

    if (role === UserRole.ADMIN) {
      throw new BadRequestException(
        'La création publique de compte administrateur est désactivée.',
      );
    }

    if (role === UserRole.PROFESSIONAL && !this.cleanText(dto.specialty ?? '')) {
      throw new BadRequestException(
        'La spécialité est requise pour un compte professionnel.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Un compte existe déjà avec ce téléphone.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        phone,
        name,
        passwordHash,
        role,
        patientProfile:
          role === UserRole.PATIENT
            ? {
                create: {
                  firstName: this.extractFirstName(name),
                  lastName: this.extractLastName(name),
                  phone,
                },
              }
            : undefined,
        professionalProfile:
          role === UserRole.PROFESSIONAL
            ? {
                create: {
                  displayName: name,
                  specialty: this.cleanText(dto.specialty ?? ''),
                  structureName: this.optionalText(dto.structureName),
                  phone,
                  city: this.optionalText(dto.city),
                  area: this.optionalText(dto.area),
                  address: this.optionalText(dto.address),
                  bio: null,
                  consultationFeeLabel: null,
                  isVerified: false,
                  appointmentDurationMinutes: 30,
                  appointmentReasons: {
                    create: DEFAULT_APPOINTMENT_REASONS,
                  },
                  schedules: {
                    create: DEFAULT_WEEKLY_SCHEDULE,
                  },
                },
              }
            : undefined,
      },
      include: {
        patientProfile: true,
        professionalProfile: {
          include: {
            appointmentReasons: true,
            schedules: {
              include: {
                slots: true,
              },
            },
          },
        },
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const phone = this.normalizePhoneCi(dto.phone);

    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        patientProfile: true,
        professionalProfile: {
          include: {
            appointmentReasons: {
              orderBy: { position: 'asc' },
            },
            schedules: {
              orderBy: { weekday: 'asc' },
              include: {
                slots: {
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordOk) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    return this.buildAuthResponse(user);
  }

  async me(currentUser: AuthenticatedUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      include: {
        patientProfile: true,
        professionalProfile: {
          include: {
            appointmentReasons: {
              orderBy: { position: 'asc' },
            },
            schedules: {
              orderBy: { weekday: 'asc' },
              include: {
                slots: {
                  orderBy: { position: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Utilisateur introuvable.');
    }

    return {
      user: this.toSafeUser(user),
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    phone: string;
    name: string;
    role: UserRole;
    isActive: boolean;
    patientProfile?: unknown;
    professionalProfile?: unknown;
  }) {
    const payload = {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') ?? '7d';

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as never,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: this.toSafeUser(user),
    };
  }

  private toSafeUser(user: {
    id: string;
    phone: string;
    name: string;
    role: UserRole;
    isActive: boolean;
    patientProfile?: unknown;
    professionalProfile?: unknown;
  }) {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      patientProfile: user.patientProfile ?? null,
      professionalProfile: user.professionalProfile ?? null,
    };
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

  private extractFirstName(fullName: string): string {
    const parts = this.cleanText(fullName).split(' ');
    return parts[0] || 'Utilisateur';
  }

  private extractLastName(fullName: string): string {
    const parts = this.cleanText(fullName).split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
}