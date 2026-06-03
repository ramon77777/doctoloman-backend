import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordResetRequestAccountType, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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

    if (
      role === UserRole.PROFESSIONAL &&
      !this.cleanText(dto.specialty ?? '')
    ) {
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

  async changeMyPassword(
    currentUser: AuthenticatedUser | null,
    dto: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    },
  ) {
    if (!currentUser?.id) {
      throw new UnauthorizedException('Session invalide.');
    }

    const currentPassword = dto.currentPassword ?? '';
    const newPassword = dto.newPassword ?? '';
    const confirmPassword = dto.confirmPassword ?? '';

    if (!currentPassword) {
      throw new BadRequestException('Mot de passe actuel requis.');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit contenir au moins 8 caractères.',
      );
    }

    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'La confirmation du mot de passe ne correspond pas.',
      );
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: currentUser.id,
      },
      include: {
        patientProfile: true,
        professionalProfile: {
          include: {
            appointmentReasons: {
              orderBy: {
                position: 'asc',
              },
            },
            schedules: {
              orderBy: {
                weekday: 'asc',
              },
              include: {
                slots: {
                  orderBy: {
                    position: 'asc',
                  },
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

    const passwordOk = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!passwordOk) {
      throw new BadRequestException('Le mot de passe actuel est incorrect.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const updatedUser = await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
      include: {
        patientProfile: true,
        professionalProfile: {
          include: {
            appointmentReasons: {
              orderBy: {
                position: 'asc',
              },
            },
            schedules: {
              orderBy: {
                weekday: 'asc',
              },
              include: {
                slots: {
                  orderBy: {
                    position: 'asc',
                  },
                },
              },
            },
          },
        },
      },
    });

    return {
      message: 'Votre mot de passe a été modifié avec succès.',
      user: this.toSafeUser(updatedUser),
    };
  }

  async createPasswordResetRequest(dto: {
    accountType: 'PATIENT' | 'PROFESSIONAL';
    fullName: string;
    phone: string;
    message?: string;
  }) {
    const requestedAccountType =
      dto.accountType === 'PATIENT'
        ? PasswordResetRequestAccountType.PATIENT
        : PasswordResetRequestAccountType.PROFESSIONAL;

    const expectedRole =
      dto.accountType === 'PATIENT' ? UserRole.PATIENT : UserRole.PROFESSIONAL;

    const phone = this.normalizePhoneCi(dto.phone);
    const fullName = this.cleanText(dto.fullName);
    const message = this.optionalMultilineText(dto.message);

    if (!fullName) {
      throw new BadRequestException('Nom complet requis.');
    }

    if (!phone || !this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000001.',
      );
    }

    const matchedUser = await this.findPasswordResetMatchedUser({
      phone,
      fullName,
      expectedRole,
    });

    const recentPendingRequest =
      await this.prisma.passwordResetRequest.findFirst({
        where: {
          phone,
          requestedAccountType,
          status: 'PENDING',
          createdAt: {
            gte: new Date(Date.now() - 30 * 60 * 1000),
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    if (recentPendingRequest) {
      return {
        message:
          'Une demande récente existe déjà. Elle sera examinée par l’administration dans un délai indicatif de 24 à 48 heures ouvrées.',
        delay: '24 à 48 heures ouvrées',
      };
    }

    await this.prisma.passwordResetRequest.create({
      data: {
        requestedAccountType,
        fullName,
        phone,
        message,
        matchedUserId: matchedUser?.id ?? null,
      },
    });

    return {
      message:
        'Votre demande de réinitialisation a bien été transmise. Pour des raisons de sécurité, elle sera vérifiée par l’administration avant toute action.',
      delay: '24 à 48 heures ouvrées',
      instruction:
        'Si votre demande est validée, l’administration vous communiquera la procédure ou un mot de passe temporaire selon les règles internes de Docto’Loman.',
    };
  }

  private async buildAuthResponse(user: {
    id: string;
    phone: string;
    name: string;
    role: UserRole;
    isActive: boolean;
    mustChangePassword?: boolean;
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
    mustChangePassword?: boolean;
    patientProfile?: unknown;
    professionalProfile?: unknown;
  }) {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword ?? false,
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

  private async findPasswordResetMatchedUser(input: {
    phone: string;
    fullName: string;
    expectedRole: UserRole;
  }) {
    const user = await this.prisma.user.findFirst({
      where: {
        phone: input.phone,
        role: input.expectedRole,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
        patientProfile: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        professionalProfile: {
          select: {
            displayName: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const submittedName = this.normalizeNameForComparison(input.fullName);

    const candidateNames = [
      user.name,
      user.patientProfile
        ? `${user.patientProfile.firstName} ${user.patientProfile.lastName}`
        : '',
      user.professionalProfile?.displayName ?? '',
    ]
      .map((name) => this.normalizeNameForComparison(name))
      .filter(Boolean);

    const hasMatchingName = candidateNames.some((candidateName) => {
      return (
        candidateName === submittedName ||
        candidateName.includes(submittedName) ||
        submittedName.includes(candidateName)
      );
    });

    return hasMatchingName ? user : null;
  }

  private optionalMultilineText(value?: string | null): string | null {
    const cleaned = (value ?? '')
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    return cleaned.length > 0 ? cleaned : null;
  }

  private normalizeNameForComparison(value: string): string {
    return this.cleanText(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
