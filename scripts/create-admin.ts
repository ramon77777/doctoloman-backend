import 'dotenv/config';

import * as bcrypt from 'bcryptjs';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL est manquant dans le fichier .env.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const phone = process.env.ADMIN_PHONE ?? '+2250700000099';
  const name = process.env.ADMIN_NAME ?? 'Admin DoctoLoman';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@12345';

  const existing = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (existing) {
    const passwordHash = await bcrypt.hash(password, 12);

    const updated = await prisma.user.update({
      where: {
        id: existing.id,
      },
      data: {
        name,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    console.log('Compte admin mis à jour :', {
      id: updated.id,
      phone: updated.phone,
      name: updated.name,
      role: updated.role,
    });

    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const created = await prisma.user.create({
    data: {
      phone,
      name,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log('Compte admin créé :', {
    id: created.id,
    phone: created.phone,
    name: created.name,
    role: created.role,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });