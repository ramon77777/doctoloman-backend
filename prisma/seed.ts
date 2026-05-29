import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL est manquant. Vérifie ton fichier .env à la racine du backend.',
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const pharmacies = [
  {
    name: 'Pharmacie Sainte Grâce',
    phone: '+2250701000001',
    city: 'Abidjan',
    area: 'Cocody',
    address: 'Rue des Jardins, Cocody',
    latitude: 5.359951,
    longitude: -3.967051,
    dutyPeriods: [
      {
        startsAt: new Date('2026-05-04T00:00:00.000Z'),
        endsAt: new Date('2026-05-10T23:59:59.000Z'),
        note: 'Garde semaine',
      },
    ],
  },
  {
    name: 'Pharmacie Les Jardins',
    phone: '+2250701000002',
    city: 'Abidjan',
    area: 'Cocody',
    address: 'Boulevard Latrille, Cocody',
    latitude: 5.374502,
    longitude: -3.996908,
    dutyPeriods: [],
  },
  {
    name: 'Pharmacie Centrale du Plateau',
    phone: '+2250701000003',
    city: 'Abidjan',
    area: 'Plateau',
    address: 'Avenue Chardy, Plateau',
    latitude: 5.320357,
    longitude: -4.016107,
    dutyPeriods: [
      {
        startsAt: new Date('2026-05-04T00:00:00.000Z'),
        endsAt: new Date('2026-05-07T23:59:59.000Z'),
        note: 'Garde de nuit',
      },
    ],
  },
];

async function main() {
  console.log("Seed Docto'Loman démarré...");

  for (const item of pharmacies) {
    const existing = await prisma.pharmacy.findFirst({
      where: {
        name: item.name,
        city: item.city,
        area: item.area,
      },
    });

    const pharmacy = existing
      ? await prisma.pharmacy.update({
          where: {
            id: existing.id,
          },
          data: {
            name: item.name,
            phone: item.phone,
            city: item.city,
            area: item.area,
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            isActive: true,
          },
        })
      : await prisma.pharmacy.create({
          data: {
            name: item.name,
            phone: item.phone,
            city: item.city,
            area: item.area,
            address: item.address,
            latitude: item.latitude,
            longitude: item.longitude,
            isActive: true,
          },
        });

    await prisma.pharmacyDutyPeriod.deleteMany({
      where: {
        pharmacyId: pharmacy.id,
      },
    });

    if (item.dutyPeriods.length > 0) {
      await prisma.pharmacyDutyPeriod.createMany({
        data: item.dutyPeriods.map((period) => ({
          pharmacyId: pharmacy.id,
          startsAt: period.startsAt,
          endsAt: period.endsAt,
          note: period.note,
        })),
      });
    }

    console.log(`Pharmacie seedée : ${pharmacy.name}`);
  }

  console.log("Seed Docto'Loman terminé.");
}

main()
  .catch((error) => {
    console.error('Erreur pendant le seed :', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });