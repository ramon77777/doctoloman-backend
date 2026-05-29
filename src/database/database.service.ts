import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DatabaseService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const result = await this.prisma.$queryRaw<Array<{ now: Date }>>`
      SELECT NOW() as now
    `;

    return {
      status: 'ok',
      database: 'postgresql',
      connected: true,
      checkedAt: result[0]?.now ?? new Date(),
    };
  }
}
