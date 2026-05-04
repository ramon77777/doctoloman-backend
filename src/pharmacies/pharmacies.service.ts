import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DutyPharmacySearchQueryDto } from './dto/duty-pharmacy-search-query.dto';
import { PharmacySearchQueryDto } from './dto/pharmacy-search-query.dto';

@Injectable()
export class PharmaciesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PharmacySearchQueryDto) {
    const where: Prisma.PharmacyWhereInput = {
      isActive: true,
      ...this.buildLocationFilters(query.city, query.area),
      ...this.buildSearchFilter(query.q),
    };

    const items = await this.prisma.pharmacy.findMany({
      where,
      orderBy: [{ city: 'asc' }, { area: 'asc' }, { name: 'asc' }],
    });

    return {
      items,
      count: items.length,
    };
  }

  async findOne(id: string) {
    const normalizedId = id.trim();

    const pharmacy = await this.prisma.pharmacy.findFirst({
      where: {
        id: normalizedId,
        isActive: true,
      },
      include: {
        dutyPeriods: {
          orderBy: {
            startsAt: 'asc',
          },
        },
      },
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    return {
      pharmacy,
    };
  }

  async listOnDuty(query: DutyPharmacySearchQueryDto) {
    const checkedAt = query.at ? new Date(query.at) : new Date();

    const where: Prisma.PharmacyDutyPeriodWhereInput = {
      startsAt: {
        lte: checkedAt,
      },
      endsAt: {
        gte: checkedAt,
      },
      pharmacy: {
        isActive: true,
        ...this.buildLocationFilters(query.city, query.area),
      },
    };

    const items = await this.prisma.pharmacyDutyPeriod.findMany({
      where,
      orderBy: [{ startsAt: 'asc' }],
      include: {
        pharmacy: true,
      },
    });

    return {
      checkedAt,
      items,
      count: items.length,
    };
  }

  private buildSearchFilter(q?: string): Prisma.PharmacyWhereInput {
    const search = this.cleanText(q ?? '');

    if (!search) {
      return {};
    }

    return {
      OR: [
        {
          name: {
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
    };
  }

  private buildLocationFilters(
    city?: string,
    area?: string,
  ): Prisma.PharmacyWhereInput {
    const cleanedCity = this.cleanText(city ?? '');
    const cleanedArea = this.cleanText(area ?? '');

    return {
      ...(cleanedCity
        ? {
            city: {
              contains: cleanedCity,
              mode: 'insensitive',
            },
          }
        : {}),
      ...(cleanedArea
        ? {
            area: {
              contains: cleanedArea,
              mode: 'insensitive',
            },
          }
        : {}),
    };
  }

  private cleanText(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }
}