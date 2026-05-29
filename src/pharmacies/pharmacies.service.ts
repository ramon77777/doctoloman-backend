import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DutyPharmacySearchQueryDto } from './dto/duty-pharmacy-search-query.dto';
import { PharmacyNearbyQueryDto } from './dto/pharmacy-nearby-query.dto';
import { PharmacySearchQueryDto } from './dto/pharmacy-search-query.dto';

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat?: number;
    lon?: number;
  };
  tags?: Record<string, string>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type PublicNearbyPharmacy = {
  id: string;
  source: 'OPENSTREETMAP';
  name: string;
  phone: string | null;
  city: string | null;
  area: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  openingHours: string | null;
  isOnDuty: false;
  isOpenNow: null;
};

type NearbyPharmaciesResponse = {
  source: 'OPENSTREETMAP';
  radiusKm: number;
  center: {
    latitude: number;
    longitude: number;
  };
  items: PublicNearbyPharmacy[];
  count: number;
  note: string;
  cached?: boolean;
  cachedAt?: string;
  expiresAt?: string;
};

type PharmacyNearbyCachePayload = {
  source: 'OPENSTREETMAP';
  radiusKm: number;
  center: {
    latitude: number;
    longitude: number;
  };
  items: PublicNearbyPharmacy[];
  count: number;
  note: string;
};

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
      source: 'LOCAL_DATABASE',
      items,
      count: items.length,
    };
  }

  async listNearby(
    query: PharmacyNearbyQueryDto,
  ): Promise<NearbyPharmaciesResponse> {
    const latitude = Number(query.latitude);
    const longitude = Number(query.longitude);
    const radiusKm = this.normalizeRadiusKm(query.radiusKm);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Latitude et longitude sont requises.');
    }

    const cacheKey = this.buildNearbyCacheKey({
      latitude,
      longitude,
      radiusKm,
    });

    const cached = await this.findValidNearbyCache(cacheKey);
    if (cached) {
      return cached;
    }

    const items = await this.searchOpenStreetMapPharmacies({
      latitude,
      longitude,
      radiusKm,
    });

    const response: PharmacyNearbyCachePayload = {
      source: 'OPENSTREETMAP',
      radiusKm,
      center: {
        latitude,
        longitude,
      },
      items,
      count: items.length,
      note: 'Les pharmacies proches proviennent d’OpenStreetMap. Les pharmacies de garde doivent être validées via une source officielle ou locale.',
    };

    await this.saveNearbyCache({
      cacheKey,
      latitude,
      longitude,
      radiusKm,
      response,
    });

    return {
      ...response,
      cached: false,
    };
  }

  async findOne(id: string) {
    const normalizedId = id.trim();

    if (normalizedId.startsWith('osm:')) {
      const pharmacy = await this.findOneOpenStreetMapPharmacy(normalizedId);

      return {
        source: 'OPENSTREETMAP',
        pharmacy,
      };
    }

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
      source: 'LOCAL_DATABASE',
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
      source: 'LOCAL_DUTY_SCHEDULE',
      checkedAt,
      items,
      count: items.length,
      note:
        items.length === 0
          ? 'Aucune pharmacie de garde officielle n’est enregistrée pour cette zone ou cette période.'
          : undefined,
    };
  }

  private buildNearbyCacheKey(input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }): string {
    const normalizedLatitude = this.normalizeCoordinateForCache(input.latitude);
    const normalizedLongitude = this.normalizeCoordinateForCache(
      input.longitude,
    );
    const normalizedRadius = this.normalizeRadiusKm(input.radiusKm);

    return [
      'osm',
      normalizedLatitude.toFixed(3),
      normalizedLongitude.toFixed(3),
      normalizedRadius.toString(),
    ].join(':');
  }

  private normalizeCoordinateForCache(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private nearbyCacheTtlMs(): number {
    const rawHours = Number(process.env.PHARMACY_NEARBY_CACHE_TTL_HOURS ?? 12);

    if (!Number.isFinite(rawHours) || rawHours <= 0) {
      return 12 * 60 * 60 * 1000;
    }

    if (rawHours > 72) {
      return 72 * 60 * 60 * 1000;
    }

    return rawHours * 60 * 60 * 1000;
  }

  private async findValidNearbyCache(
    cacheKey: string,
  ): Promise<NearbyPharmaciesResponse | null> {
    const cache = await this.prisma.pharmacyNearbySearchCache.findUnique({
      where: {
        cacheKey,
      },
    });

    if (!cache) {
      return null;
    }

    const now = new Date();

    if (cache.expiresAt <= now) {
      await this.prisma.pharmacyNearbySearchCache
        .delete({
          where: {
            id: cache.id,
          },
        })
        .catch(() => undefined);

      return null;
    }

    const parsed = this.parseNearbyCachePayload(cache.response);
    if (!parsed) {
      await this.prisma.pharmacyNearbySearchCache
        .delete({
          where: {
            id: cache.id,
          },
        })
        .catch(() => undefined);

      return null;
    }

    return {
      ...parsed,
      cached: true,
      cachedAt: cache.updatedAt.toISOString(),
      expiresAt: cache.expiresAt.toISOString(),
    };
  }

  private async saveNearbyCache(input: {
    cacheKey: string;
    latitude: number;
    longitude: number;
    radiusKm: number;
    response: PharmacyNearbyCachePayload;
  }): Promise<void> {
    const expiresAt = new Date(Date.now() + this.nearbyCacheTtlMs());

    await this.prisma.pharmacyNearbySearchCache.upsert({
      where: {
        cacheKey: input.cacheKey,
      },
      create: {
        cacheKey: input.cacheKey,
        latitude: this.normalizeCoordinateForCache(input.latitude),
        longitude: this.normalizeCoordinateForCache(input.longitude),
        radiusKm: input.radiusKm,
        response: input.response,
        expiresAt,
      },
      update: {
        latitude: this.normalizeCoordinateForCache(input.latitude),
        longitude: this.normalizeCoordinateForCache(input.longitude),
        radiusKm: input.radiusKm,
        response: input.response,
        expiresAt,
      },
    });
  }

  private parseNearbyCachePayload(
    value: unknown,
  ): PharmacyNearbyCachePayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const candidate = value as Partial<PharmacyNearbyCachePayload>;

    if (candidate.source !== 'OPENSTREETMAP') {
      return null;
    }

    if (
      typeof candidate.radiusKm !== 'number' ||
      !candidate.center ||
      typeof candidate.center.latitude !== 'number' ||
      typeof candidate.center.longitude !== 'number' ||
      !Array.isArray(candidate.items) ||
      typeof candidate.count !== 'number' ||
      typeof candidate.note !== 'string'
    ) {
      return null;
    }

    return {
      source: 'OPENSTREETMAP',
      radiusKm: candidate.radiusKm,
      center: {
        latitude: candidate.center.latitude,
        longitude: candidate.center.longitude,
      },
      items: candidate.items.filter(
        (item): item is PublicNearbyPharmacy =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number' &&
          typeof item.distanceKm === 'number',
      ),
      count: candidate.count,
      note: candidate.note,
    };
  }

  private async searchOpenStreetMapPharmacies(input: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  }): Promise<PublicNearbyPharmacy[]> {
    const radiusMeters = Math.round(input.radiusKm * 1000);

    const query = `
[out:json][timeout:20];
(
  node["amenity"="pharmacy"](around:${radiusMeters},${input.latitude},${input.longitude});
  way["amenity"="pharmacy"](around:${radiusMeters},${input.latitude},${input.longitude});
  relation["amenity"="pharmacy"](around:${radiusMeters},${input.latitude},${input.longitude});
);
out center tags;
`;

    const data = await this.fetchOverpass(query);
    const elements = data.elements ?? [];

    const pharmacies = elements
      .map((element) =>
        this.toPublicNearbyPharmacy({
          element,
          originLatitude: input.latitude,
          originLongitude: input.longitude,
        }),
      )
      .filter((pharmacy): pharmacy is PublicNearbyPharmacy => pharmacy !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return pharmacies;
  }

  private async findOneOpenStreetMapPharmacy(
    osmId: string,
  ): Promise<PublicNearbyPharmacy> {
    const parts = osmId.split(':');

    if (parts.length !== 3) {
      throw new BadRequestException('Identifiant OpenStreetMap invalide.');
    }

    const [, rawType, rawId] = parts;
    const type = rawType.trim();
    const id = Number(rawId);

    if (!['node', 'way', 'relation'].includes(type) || !Number.isFinite(id)) {
      throw new BadRequestException('Identifiant OpenStreetMap invalide.');
    }

    const query = `
[out:json][timeout:20];
${type}(${id});
out center tags;
`;

    const data = await this.fetchOverpass(query);
    const element = data.elements?.[0];

    if (!element) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    const pharmacy = this.toPublicNearbyPharmacy({
      element,
      originLatitude: this.elementLatitude(element) ?? 0,
      originLongitude: this.elementLongitude(element) ?? 0,
    });

    if (!pharmacy) {
      throw new NotFoundException('Pharmacie introuvable.');
    }

    return pharmacy;
  }

  private async fetchOverpass(query: string): Promise<OverpassResponse> {
    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ];

    const errors: string[] = [];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'text/plain; charset=UTF-8',
            'user-agent': 'DoctoLoman/1.0 pharmacy-nearby-search',
          },
          body: query,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          errors.push(
            `${endpoint} -> HTTP ${response.status}${
              body ? ` : ${body.slice(0, 160)}` : ''
            }`,
          );
          continue;
        }

        const json = (await response.json()) as OverpassResponse;
        return json;
      } catch (error) {
        errors.push(
          `${endpoint} -> ${
            error instanceof Error ? error.message : 'Erreur inconnue'
          }`,
        );
      }
    }

    throw new BadRequestException(
      `Recherche pharmacies indisponible pour le moment. Détails : ${errors.join(
        ' | ',
      )}`,
    );
  }

  private toPublicNearbyPharmacy(input: {
    element: OverpassElement;
    originLatitude: number;
    originLongitude: number;
  }): PublicNearbyPharmacy | null {
    const latitude = this.elementLatitude(input.element);
    const longitude = this.elementLongitude(input.element);

    if (latitude === null || longitude === null) {
      return null;
    }

    const tags = input.element.tags ?? {};
    const name = this.cleanText(tags.name ?? '') || 'Pharmacie';

    return {
      id: `osm:${input.element.type}:${input.element.id}`,
      source: 'OPENSTREETMAP',
      name,
      phone: this.firstNonEmpty([
        tags.phone,
        tags['contact:phone'],
        tags['mobile'],
        tags['contact:mobile'],
      ]),
      city: this.firstNonEmpty([
        tags['addr:city'],
        tags['addr:town'],
        tags['addr:village'],
      ]),
      area: this.firstNonEmpty([
        tags['addr:suburb'],
        tags['addr:quarter'],
        tags['addr:neighbourhood'],
      ]),
      address: this.buildOsmAddress(tags),
      latitude,
      longitude,
      distanceKm: this.roundDistanceKm(
        this.distanceKm({
          fromLatitude: input.originLatitude,
          fromLongitude: input.originLongitude,
          toLatitude: latitude,
          toLongitude: longitude,
        }),
      ),
      openingHours: this.firstNonEmpty([tags.opening_hours]),
      isOnDuty: false,
      isOpenNow: null,
    };
  }

  private elementLatitude(element: OverpassElement): number | null {
    const value = element.lat ?? element.center?.lat;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private elementLongitude(element: OverpassElement): number | null {
    const value = element.lon ?? element.center?.lon;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private buildOsmAddress(tags: Record<string, string>): string | null {
    const parts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:suburb'],
      tags['addr:city'],
    ]
      .map((value) => this.cleanText(value ?? ''))
      .filter((value) => value.length > 0);

    if (parts.length > 0) {
      return parts.join(', ');
    }

    return this.firstNonEmpty([tags['addr:full'], tags.address]);
  }

  private firstNonEmpty(values: Array<string | undefined>): string | null {
    for (const value of values) {
      const cleaned = this.cleanText(value ?? '');
      if (cleaned) {
        return cleaned;
      }
    }

    return null;
  }

  private normalizeRadiusKm(value?: number): number {
    const radius = Number(value ?? 5);

    if (!Number.isFinite(radius)) {
      return 5;
    }

    if (radius < 1) {
      return 1;
    }

    if (radius > 30) {
      return 30;
    }

    return radius;
  }

  private roundDistanceKm(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private distanceKm(input: {
    fromLatitude: number;
    fromLongitude: number;
    toLatitude: number;
    toLongitude: number;
  }): number {
    const earthRadiusKm = 6371;

    const dLat = this.toRadians(input.toLatitude - input.fromLatitude);
    const dLon = this.toRadians(input.toLongitude - input.fromLongitude);

    const lat1 = this.toRadians(input.fromLatitude);
    const lat2 = this.toRadians(input.toLatitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
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
