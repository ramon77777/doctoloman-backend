import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AppointmentStatus,
  NotificationStatus,
  PasswordResetRequestStatus,
  Prisma,
  TeleconsultationStatus,
  UserRole,
} from '@prisma/client';

import * as bcrypt from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [
      totalUsers,
      activeUsers,
      patients,
      professionals,
      admins,
      verifiedProfessionals,
      pendingProfessionals,
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
      totalTeleconsultations,
      waitingTeleconsultations,
      inProgressTeleconsultations,
      totalPharmacies,
      activePharmacies,
      onDutyPharmacies,
      totalNotifications,
      unreadNotifications,
      failedNotifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.PATIENT,
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.PROFESSIONAL,
        },
      }),
      this.prisma.user.count({
        where: {
          role: UserRole.ADMIN,
        },
      }),
      this.prisma.professionalProfile.count({
        where: {
          isVerified: true,
        },
      }),
      this.prisma.professionalProfile.count({
        where: {
          isVerified: false,
        },
      }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.PENDING,
        },
      }),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.CONFIRMED,
        },
      }),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.COMPLETED,
        },
      }),
      this.prisma.appointment.count({
        where: {
          status: {
            in: [
              AppointmentStatus.CANCELLED_BY_PATIENT,
              AppointmentStatus.CANCELLED_BY_PROFESSIONAL,
              AppointmentStatus.DECLINED_BY_PROFESSIONAL,
              AppointmentStatus.NO_SHOW,
            ],
          },
        },
      }),
      this.prisma.teleconsultationSession.count(),
      this.prisma.teleconsultationSession.count({
        where: {
          status: TeleconsultationStatus.WAITING,
        },
      }),
      this.prisma.teleconsultationSession.count({
        where: {
          status: TeleconsultationStatus.IN_PROGRESS,
        },
      }),
      this.prisma.pharmacy.count(),
      this.prisma.pharmacy.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.pharmacy.count({
        where: {
          isOnDuty: true,
          isActive: true,
        },
      }),
      this.prisma.appNotification.count(),
      this.prisma.appNotification.count({
        where: {
          readAt: null,
        },
      }),
      this.prisma.appNotification.count({
        where: {
          status: NotificationStatus.FAILED,
        },
      }),
    ]);

    const recentAppointments = await this.prisma.appointment.findMany({
      take: 6,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        professional: {
          select: {
            id: true,
            displayName: true,
            specialty: true,
            phone: true,
            city: true,
            area: true,
          },
        },
      },
    });

    const recentProfessionals = await this.prisma.professionalProfile.findMany({
      take: 6,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        displayName: true,
        specialty: true,
        structureName: true,
        phone: true,
        city: true,
        area: true,
        isVerified: true,
        createdAt: true,
      },
    });

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        patients,
        professionals,
        admins,
      },
      professionals: {
        total: professionals,
        verified: verifiedProfessionals,
        pending: pendingProfessionals,
      },
      appointments: {
        total: totalAppointments,
        pending: pendingAppointments,
        confirmed: confirmedAppointments,
        completed: completedAppointments,
        closed: cancelledAppointments,
      },
      teleconsultations: {
        total: totalTeleconsultations,
        waiting: waitingTeleconsultations,
        inProgress: inProgressTeleconsultations,
      },
      pharmacies: {
        total: totalPharmacies,
        active: activePharmacies,
        onDuty: onDutyPharmacies,
      },
      notifications: {
        total: totalNotifications,
        unread: unreadNotifications,
        failed: failedNotifications,
      },
      recentAppointments,
      recentProfessionals,
    };
  }

  async listPasswordResetRequests(query: {
    q?: string;
    status?: PasswordResetRequestStatus;
  }) {
    const where = this.buildPasswordResetRequestWhere(query);

    const [items, total, pending, completed, rejected] = await Promise.all([
      this.prisma.passwordResetRequest.findMany({
        where,
        take: 100,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          matchedUser: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
              isActive: true,
              mustChangePassword: true,
              patientProfile: {
                select: {
                  firstName: true,
                  lastName: true,
                  city: true,
                  district: true,
                },
              },
              professionalProfile: {
                select: {
                  displayName: true,
                  specialty: true,
                  city: true,
                  area: true,
                  isVerified: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.passwordResetRequest.count({
        where,
      }),
      this.prisma.passwordResetRequest.count({
        where: {
          ...where,
          status: PasswordResetRequestStatus.PENDING,
        },
      }),
      this.prisma.passwordResetRequest.count({
        where: {
          ...where,
          status: PasswordResetRequestStatus.COMPLETED,
        },
      }),
      this.prisma.passwordResetRequest.count({
        where: {
          ...where,
          status: PasswordResetRequestStatus.REJECTED,
        },
      }),
    ]);

    return {
      items,
      count: items.length,
      total,
      pending,
      completed,
      rejected,
      note: 'Vérifiez toujours l’identité du demandeur avant de générer un mot de passe temporaire.',
    };
  }

  async getPasswordResetRequestDetail(id: string) {
    const request = await this.prisma.passwordResetRequest.findUnique({
      where: {
        id,
      },
      include: {
        matchedUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
            createdAt: true,
            updatedAt: true,
            patientProfile: true,
            professionalProfile: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Demande de réinitialisation introuvable.');
    }

    return {
      request,
      securityNote:
        'Ne générez un mot de passe temporaire qu’après vérification suffisante de l’identité du demandeur.',
    };
  }

  async rejectPasswordResetRequest(
    id: string,
    dto: {
      adminNote?: string;
    },
  ) {
    const existing = await this.prisma.passwordResetRequest.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Demande de réinitialisation introuvable.');
    }

    if (existing.status !== PasswordResetRequestStatus.PENDING) {
      throw new BadRequestException(
        'Seules les demandes en attente peuvent être rejetées.',
      );
    }

    const request = await this.prisma.passwordResetRequest.update({
      where: {
        id,
      },
      data: {
        status: PasswordResetRequestStatus.REJECTED,
        adminNote: this.optionalMultilineText(dto.adminNote),
        reviewedAt: new Date(),
        rejectedAt: new Date(),
      },
      include: {
        matchedUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    return {
      request,
      message: 'Demande rejetée avec succès.',
    };
  }

  async generateTemporaryPasswordForResetRequest(id: string) {
    const existing = await this.prisma.passwordResetRequest.findUnique({
      where: {
        id,
      },
      include: {
        matchedUser: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Demande de réinitialisation introuvable.');
    }

    if (existing.status !== PasswordResetRequestStatus.PENDING) {
      throw new BadRequestException(
        'Seules les demandes en attente peuvent recevoir un mot de passe temporaire.',
      );
    }

    if (!existing.matchedUserId || !existing.matchedUser) {
      throw new BadRequestException(
        'Aucun compte correspondant fiable n’est associé à cette demande.',
      );
    }

    if (!existing.matchedUser.isActive) {
      throw new BadRequestException('Le compte correspondant est inactif.');
    }

    if (
      existing.matchedUser.role !== UserRole.PATIENT &&
      existing.matchedUser.role !== UserRole.PROFESSIONAL
    ) {
      throw new BadRequestException(
        'La réinitialisation publique ne concerne que les patients et professionnels.',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const now = new Date();

    const request = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: existing.matchedUserId as string,
        },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      });

      return tx.passwordResetRequest.update({
        where: {
          id,
        },
        data: {
          status: PasswordResetRequestStatus.COMPLETED,
          reviewedAt: now,
          completedAt: now,
          temporaryPasswordGeneratedAt: now,
          adminNote:
            existing.adminNote ??
            'Mot de passe temporaire généré par l’administration.',
        },
        include: {
          matchedUser: {
            select: {
              id: true,
              name: true,
              phone: true,
              role: true,
              isActive: true,
              mustChangePassword: true,
            },
          },
        },
      });
    });

    return {
      request,
      temporaryPassword,
      warning:
        'Communiquez ce mot de passe temporaire uniquement après vérification fiable de l’identité. L’utilisateur devra le changer après connexion.',
    };
  }

  async listProfessionals(query: {
    q?: string;
    verification?: 'ALL' | 'VERIFIED' | 'PENDING';
    city?: string;
    specialty?: string;
  }) {
    const where = this.buildProfessionalWhere(query);

    const [items, total, verified, pending] = await Promise.all([
      this.prisma.professionalProfile.findMany({
        where,
        orderBy: [{ isVerified: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          displayName: true,
          specialty: true,
          structureName: true,
          phone: true,
          city: true,
          area: true,
          address: true,
          isVerified: true,
          appointmentDurationMinutes: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              phone: true,
              name: true,
              isActive: true,
              createdAt: true,
            },
          },
          appointmentReasons: {
            orderBy: {
              position: 'asc',
            },
            select: {
              id: true,
              label: true,
              durationMinutes: true,
              position: true,
              isActive: true,
            },
          },
          schedules: {
            orderBy: {
              weekday: 'asc',
            },
            select: {
              id: true,
              weekday: true,
              label: true,
              isOpen: true,
              slots: {
                orderBy: {
                  position: 'asc',
                },
                select: {
                  id: true,
                  startTime: true,
                  endTime: true,
                  position: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.professionalProfile.count({
        where,
      }),
      this.prisma.professionalProfile.count({
        where: {
          ...where,
          isVerified: true,
        },
      }),
      this.prisma.professionalProfile.count({
        where: {
          ...where,
          isVerified: false,
        },
      }),
    ]);

    return {
      items,
      count: items.length,
      total,
      verified,
      pending,
    };
  }

  async getProfessionalDetail(id: string) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        id,
      },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
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
        appointments: {
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            patientName: true,
            patientPhone: true,
            day: true,
            slot: true,
            reason: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        teleconsultations: {
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            patientName: true,
            patientPhone: true,
            scheduledAt: true,
            reason: true,
            status: true,
            consentAccepted: true,
            startedAt: true,
            endedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!professional) {
      throw new NotFoundException('Professionnel introuvable.');
    }

    const [
      appointmentsCount,
      teleconsultationsCount,
      activeMedicalAccessesCount,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          professionalId: professional.id,
        },
      }),
      this.prisma.teleconsultationSession.count({
        where: {
          professionalId: professional.id,
        },
      }),
      this.prisma.medicalAccess.count({
        where: {
          professionalId: professional.id,
          revokedAt: null,
        },
      }),
    ]);

    return {
      professional,
      stats: {
        appointments: appointmentsCount,
        teleconsultations: teleconsultationsCount,
        activeMedicalAccesses: activeMedicalAccessesCount,
        activeReasons: professional.appointmentReasons.filter(
          (reason) => reason.isActive,
        ).length,
        openDays: professional.schedules.filter((schedule) => schedule.isOpen)
          .length,
      },
    };
  }

  async setProfessionalVerification(id: string, isVerified: boolean) {
    const professional = await this.prisma.professionalProfile.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!professional) {
      throw new NotFoundException('Professionnel introuvable.');
    }

    const updated = await this.prisma.professionalProfile.update({
      where: {
        id,
      },
      data: {
        isVerified,
      },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            name: true,
            isActive: true,
          },
        },
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
    });

    return {
      professional: updated,
    };
  }

  private buildProfessionalWhere(query: {
    q?: string;
    verification?: 'ALL' | 'VERIFIED' | 'PENDING';
    city?: string;
    specialty?: string;
  }): Prisma.ProfessionalProfileWhereInput {
    const search = this.cleanText(query.q ?? '');
    const city = this.cleanText(query.city ?? '');
    const specialty = this.cleanText(query.specialty ?? '');

    return {
      ...(query.verification === 'VERIFIED'
        ? {
            isVerified: true,
          }
        : {}),
      ...(query.verification === 'PENDING'
        ? {
            isVerified: false,
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
      ...(specialty
        ? {
            specialty: {
              contains: specialty,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                displayName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                specialty: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                structureName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                city: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                area: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  async listAppointments(query: {
    q?: string;
    status?:
      | 'ALL'
      | 'PENDING'
      | 'CONFIRMED'
      | 'COMPLETED'
      | 'NO_SHOW'
      | 'CANCELLED';
    day?: string;
    city?: string;
  }) {
    const where = this.buildAppointmentWhere(query);

    const [items, total, pending, confirmed, completed, noShow, cancelled] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where,
          take: 100,
          orderBy: [{ day: 'desc' }, { slot: 'desc' }, { createdAt: 'desc' }],
          include: {
            professional: {
              select: {
                id: true,
                displayName: true,
                specialty: true,
                structureName: true,
                phone: true,
                city: true,
                area: true,
                isVerified: true,
              },
            },
            teleconsultation: {
              select: {
                id: true,
                status: true,
                scheduledAt: true,
                consentAccepted: true,
                startedAt: true,
                endedAt: true,
              },
            },
          },
        }),
        this.prisma.appointment.count({
          where,
        }),
        this.prisma.appointment.count({
          where: {
            ...where,
            status: AppointmentStatus.PENDING,
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...where,
            status: AppointmentStatus.CONFIRMED,
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...where,
            status: AppointmentStatus.COMPLETED,
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...where,
            status: AppointmentStatus.NO_SHOW,
          },
        }),
        this.prisma.appointment.count({
          where: {
            ...where,
            status: {
              in: [
                AppointmentStatus.CANCELLED_BY_PATIENT,
                AppointmentStatus.CANCELLED_BY_PROFESSIONAL,
                AppointmentStatus.DECLINED_BY_PROFESSIONAL,
              ],
            },
          },
        }),
      ]);

    return {
      items,
      count: items.length,
      total,
      pending,
      confirmed,
      completed,
      noShow,
      cancelled,
    };
  }

  async getAppointmentDetail(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: {
        id,
      },
      include: {
        professional: {
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
              },
            },
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
        teleconsultation: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Rendez-vous introuvable.');
    }

    const relatedAppointments = await this.prisma.appointment.findMany({
      where: {
        patientPhone: appointment.patientPhone,
        id: {
          not: appointment.id,
        },
      },
      take: 8,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        professional: {
          select: {
            id: true,
            displayName: true,
            specialty: true,
          },
        },
      },
    });

    return {
      appointment,
      relatedAppointments,
    };
  }

  async listPatients(query: {
    q?: string;
    status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
    city?: string;
    district?: string;
  }) {
    const where = this.buildPatientWhere(query);

    const [items, total, active, inactive] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: 100,
        orderBy: {
          createdAt: 'desc',
        },
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          patientProfile: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              city: true,
              district: true,
              address: true,
              birthDate: true,
              gender: true,
              bloodGroup: true,
              emergencyContactName: true,
              emergencyContactPhone: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.user.count({
        where,
      }),
      this.prisma.user.count({
        where: {
          ...where,
          isActive: true,
        },
      }),
      this.prisma.user.count({
        where: {
          ...where,
          isActive: false,
        },
      }),
    ]);

    return {
      items,
      count: items.length,
      total,
      active,
      inactive,
    };
  }

  async getPatientDetail(id: string) {
    const patient = await this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.PATIENT,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        patientProfile: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            city: true,
            district: true,
            address: true,
            birthDate: true,
            gender: true,
            bloodGroup: true,
            allergies: true,
            medicalNotes: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient introuvable.');
    }

    const patientPhones = [patient.phone, patient.patientProfile?.phone]
      .map((phone) => this.cleanText(phone ?? ''))
      .filter(
        (phone, index, phones) =>
          phone.length > 0 && phones.indexOf(phone) === index,
      );

    const [
      appointments,
      appointmentsCount,
      teleconsultations,
      teleconsultationsCount,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          patientPhone: {
            in: patientPhones,
          },
        },
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          professional: {
            select: {
              id: true,
              displayName: true,
              specialty: true,
              phone: true,
              city: true,
              area: true,
              isVerified: true,
            },
          },
          teleconsultation: {
            select: {
              id: true,
              status: true,
              scheduledAt: true,
              consentAccepted: true,
              startedAt: true,
              endedAt: true,
            },
          },
        },
      }),
      this.prisma.appointment.count({
        where: {
          patientPhone: {
            in: patientPhones,
          },
        },
      }),
      this.prisma.teleconsultationSession.findMany({
        where: {
          patientPhone: {
            in: patientPhones,
          },
        },
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          professional: {
            select: {
              id: true,
              displayName: true,
              specialty: true,
              phone: true,
              city: true,
              area: true,
              isVerified: true,
            },
          },
        },
      }),
      this.prisma.teleconsultationSession.count({
        where: {
          patientPhone: {
            in: patientPhones,
          },
        },
      }),
    ]);

    return {
      patient,
      stats: {
        appointments: appointmentsCount,
        teleconsultations: teleconsultationsCount,
      },
      appointments,
      teleconsultations,
      note: 'L’espace admin affiche les informations de supervision. L’accès aux documents médicaux sensibles doit rester encadré par les autorisations et l’audit.',
    };
  }

  async listPharmacies(query: {
    q?: string;
    status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ON_DUTY';
    city?: string;
    area?: string;
  }) {
    const where = this.buildPharmacyWhere(query);

    const [items, total, active, inactive, onDuty] = await Promise.all([
      this.prisma.pharmacy.findMany({
        where,
        take: 100,
        orderBy: [{ isActive: 'desc' }, { city: 'asc' }, { name: 'asc' }],
        include: {
          dutyPeriods: {
            orderBy: {
              startsAt: 'desc',
            },
            take: 5,
          },
        },
      }),
      this.prisma.pharmacy.count({
        where,
      }),
      this.prisma.pharmacy.count({
        where: {
          ...where,
          isActive: true,
        },
      }),
      this.prisma.pharmacy.count({
        where: {
          ...where,
          isActive: false,
        },
      }),
      this.prisma.pharmacy.count({
        where: {
          ...where,
          isActive: true,
          isOnDuty: true,
        },
      }),
    ]);

    return {
      items,
      count: items.length,
      total,
      active,
      inactive,
      onDuty,
      note: 'Les pharmacies locales et les périodes de garde doivent être validées depuis une source officielle ou locale fiable.',
    };
  }

  async getPharmacyDetail(id: string) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: {
        id,
      },
      include: {
        dutyPeriods: {
          orderBy: {
            startsAt: 'desc',
          },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    const now = new Date();

    const [pastDutyPeriods, activeDutyPeriods, upcomingDutyPeriods] =
      await Promise.all([
        this.prisma.pharmacyDutyPeriod.count({
          where: {
            pharmacyId: id,
            endsAt: {
              lt: now,
            },
          },
        }),
        this.prisma.pharmacyDutyPeriod.count({
          where: {
            pharmacyId: id,
            startsAt: {
              lte: now,
            },
            endsAt: {
              gte: now,
            },
          },
        }),
        this.prisma.pharmacyDutyPeriod.count({
          where: {
            pharmacyId: id,
            startsAt: {
              gt: now,
            },
          },
        }),
      ]);

    return {
      pharmacy,
      stats: {
        dutyPeriods: pharmacy.dutyPeriods.length,
        pastDutyPeriods,
        activeDutyPeriods,
        upcomingDutyPeriods,
      },
      note: 'Les périodes de garde affichées doivent être issues d’une source officielle ou locale fiable.',
    };
  }

  async createPharmacy(dto: {
    name: string;
    phone: string;
    city: string;
    area?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    isOnDuty?: boolean;
    isActive?: boolean;
  }) {
    const phone = this.normalizePhoneCi(dto.phone);

    if (!this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000010.',
      );
    }

    const existing = await this.prisma.pharmacy.findUnique({
      where: {
        phone,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Une pharmacie existe déjà avec ce téléphone.',
      );
    }

    const pharmacy = await this.prisma.pharmacy.create({
      data: {
        name: this.requiredText(dto.name, 'Nom de la pharmacie requis.'),
        phone,
        city: this.requiredText(dto.city, 'Ville requise.'),
        area: this.optionalText(dto.area),
        address: this.optionalText(dto.address),
        latitude: this.optionalNumber(dto.latitude),
        longitude: this.optionalNumber(dto.longitude),
        isOnDuty: dto.isOnDuty ?? false,
        isActive: dto.isActive ?? true,
      },
      include: {
        dutyPeriods: true,
      },
    });

    return {
      pharmacy,
    };
  }

  async updatePharmacy(
    id: string,
    dto: {
      name?: string;
      phone?: string;
      city?: string;
      area?: string;
      address?: string;
      latitude?: number | null;
      longitude?: number | null;
      isOnDuty?: boolean;
      isActive?: boolean;
    },
  ) {
    const existing = await this.prisma.pharmacy.findUnique({
      where: {
        id,
      },
    });

    if (!existing) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    const phone =
      dto.phone === undefined
        ? existing.phone
        : this.normalizePhoneCi(dto.phone);

    if (!this.isValidCiPhone(phone)) {
      throw new BadRequestException(
        'Format téléphone invalide. Exemple : +2250700000010.',
      );
    }

    if (phone !== existing.phone) {
      const phoneOwner = await this.prisma.pharmacy.findUnique({
        where: {
          phone,
        },
        select: {
          id: true,
        },
      });

      if (phoneOwner && phoneOwner.id !== id) {
        throw new BadRequestException(
          'Une autre pharmacie utilise déjà ce téléphone.',
        );
      }
    }

    const pharmacy = await this.prisma.pharmacy.update({
      where: {
        id,
      },
      data: {
        name:
          dto.name === undefined
            ? existing.name
            : this.requiredText(dto.name, 'Nom de la pharmacie requis.'),
        phone,
        city:
          dto.city === undefined
            ? existing.city
            : this.requiredText(dto.city, 'Ville requise.'),
        area:
          dto.area === undefined ? existing.area : this.optionalText(dto.area),
        address:
          dto.address === undefined
            ? existing.address
            : this.optionalText(dto.address),
        latitude:
          dto.latitude === undefined
            ? existing.latitude
            : this.optionalNumber(dto.latitude),
        longitude:
          dto.longitude === undefined
            ? existing.longitude
            : this.optionalNumber(dto.longitude),
        isOnDuty: dto.isOnDuty ?? existing.isOnDuty,
        isActive: dto.isActive ?? existing.isActive,
      },
      include: {
        dutyPeriods: {
          orderBy: {
            startsAt: 'desc',
          },
        },
      },
    });

    return {
      pharmacy,
    };
  }

  async setPharmacyActive(id: string, isActive: boolean) {
    const existing = await this.prisma.pharmacy.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    const pharmacy = await this.prisma.pharmacy.update({
      where: {
        id,
      },
      data: {
        isActive,
      },
      include: {
        dutyPeriods: {
          orderBy: {
            startsAt: 'desc',
          },
        },
      },
    });

    return {
      pharmacy,
    };
  }

  async createPharmacyDutyPeriod(
    pharmacyId: string,
    dto: {
      startsAt: string;
      endsAt: string;
      note?: string;
    },
  ) {
    const pharmacy = await this.prisma.pharmacy.findUnique({
      where: {
        id: pharmacyId,
      },
      select: {
        id: true,
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Dates de garde invalides.');
    }

    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fin de garde doit être postérieure au début.',
      );
    }

    const dutyPeriod = await this.prisma.pharmacyDutyPeriod.create({
      data: {
        pharmacyId,
        startsAt,
        endsAt,
        note: this.optionalMultilineText(dto.note),
      },
    });

    await this.refreshPharmacyDutyFlag(pharmacyId);

    return {
      dutyPeriod,
    };
  }

  async deletePharmacyDutyPeriod(dutyPeriodId: string) {
    const existing = await this.prisma.pharmacyDutyPeriod.findUnique({
      where: {
        id: dutyPeriodId,
      },
      select: {
        id: true,
        pharmacyId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Période de garde introuvable.');
    }

    await this.prisma.pharmacyDutyPeriod.delete({
      where: {
        id: dutyPeriodId,
      },
    });

    await this.refreshPharmacyDutyFlag(existing.pharmacyId);

    return {
      deleted: true,
      dutyPeriodId,
    };
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private buildAppointmentWhere(query: {
    q?: string;
    status?:
      | 'ALL'
      | 'PENDING'
      | 'CONFIRMED'
      | 'COMPLETED'
      | 'NO_SHOW'
      | 'CANCELLED';
    day?: string;
    city?: string;
  }): Prisma.AppointmentWhereInput {
    const search = this.cleanText(query.q ?? '');
    const city = this.cleanText(query.city ?? '');
    const day = this.cleanText(query.day ?? '');

    return {
      ...this.buildAppointmentStatusFilter(query.status),
      ...(day
        ? {
            day: this.parseDateOnly(day),
          }
        : {}),
      ...(city
        ? {
            professional: {
              city: {
                contains: city,
                mode: 'insensitive',
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                patientName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                patientPhone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                reason: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                professional: {
                  displayName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                professional: {
                  specialty: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                professional: {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildAppointmentStatusFilter(
    status?:
      | 'ALL'
      | 'PENDING'
      | 'CONFIRMED'
      | 'COMPLETED'
      | 'NO_SHOW'
      | 'CANCELLED',
  ): Prisma.AppointmentWhereInput {
    if (!status || status === 'ALL') {
      return {};
    }

    if (status === 'CANCELLED') {
      return {
        status: {
          in: [
            AppointmentStatus.CANCELLED_BY_PATIENT,
            AppointmentStatus.CANCELLED_BY_PROFESSIONAL,
            AppointmentStatus.DECLINED_BY_PROFESSIONAL,
          ],
        },
      };
    }

    return {
      status,
    };
  }

  private parseDateOnly(value: string): Date {
    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'Date invalide. Format attendu : YYYY-MM-DD.',
      );
    }

    return parsed;
  }

  private buildPatientWhere(query: {
    q?: string;
    status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
    city?: string;
    district?: string;
  }): Prisma.UserWhereInput {
    const search = this.cleanText(query.q ?? '');
    const city = this.cleanText(query.city ?? '');
    const district = this.cleanText(query.district ?? '');

    return {
      role: UserRole.PATIENT,
      ...(query.status === 'ACTIVE'
        ? {
            isActive: true,
          }
        : {}),
      ...(query.status === 'INACTIVE'
        ? {
            isActive: false,
          }
        : {}),
      ...(city
        ? {
            patientProfile: {
              city: {
                contains: city,
                mode: 'insensitive',
              },
            },
          }
        : {}),
      ...(district
        ? {
            patientProfile: {
              district: {
                contains: district,
                mode: 'insensitive',
              },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                patientProfile: {
                  firstName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                patientProfile: {
                  lastName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                patientProfile: {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                patientProfile: {
                  city: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                patientProfile: {
                  district: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private buildPharmacyWhere(query: {
    q?: string;
    status?: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ON_DUTY';
    city?: string;
    area?: string;
  }): Prisma.PharmacyWhereInput {
    const search = this.cleanText(query.q ?? '');
    const city = this.cleanText(query.city ?? '');
    const area = this.cleanText(query.area ?? '');

    return {
      ...(query.status === 'ACTIVE'
        ? {
            isActive: true,
          }
        : {}),
      ...(query.status === 'INACTIVE'
        ? {
            isActive: false,
          }
        : {}),
      ...(query.status === 'ON_DUTY'
        ? {
            isActive: true,
            isOnDuty: true,
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
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                city: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                area: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                address: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
  }

  private async refreshPharmacyDutyFlag(pharmacyId: string): Promise<void> {
    const now = new Date();

    const activeDutyPeriod = await this.prisma.pharmacyDutyPeriod.findFirst({
      where: {
        pharmacyId,
        startsAt: {
          lte: now,
        },
        endsAt: {
          gte: now,
        },
      },
      select: {
        id: true,
      },
    });

    await this.prisma.pharmacy.update({
      where: {
        id: pharmacyId,
      },
      data: {
        isOnDuty: Boolean(activeDutyPeriod),
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

  private requiredText(value: string, message: string): string {
    const cleaned = this.cleanText(value);

    if (!cleaned) {
      throw new BadRequestException(message);
    }

    return cleaned;
  }

  private optionalText(value?: string | null): string | null {
    const cleaned = this.cleanText(value ?? '');
    return cleaned.length > 0 ? cleaned : null;
  }

  private optionalMultilineText(value?: string | null): string | null {
    const cleaned = (value ?? '')
      .trim()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n');

    return cleaned.length > 0 ? cleaned : null;
  }

  private optionalNumber(value?: number | null): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  private buildPasswordResetRequestWhere(query: {
    q?: string;
    status?: PasswordResetRequestStatus;
  }): Prisma.PasswordResetRequestWhereInput {
    const search = this.cleanText(query.q ?? '');

    return {
      ...(query.status
        ? {
            status: query.status,
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                fullName: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                message: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                matchedUser: {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
              {
                matchedUser: {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };
  }

  private generateTemporaryPassword(): string {
    const randomNumber = Math.floor(100000 + Math.random() * 900000);

    return `Docto-${randomNumber}-Temp`;
  }
}
