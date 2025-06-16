import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@admetrics.com' },
    update: {},
    create: {
      email: 'admin@admetrics.com',
      username: 'admin',
      fullName: 'System Administrator',
      password: adminPassword,
      role: 'admin',
      isActive: true,
      emailVerified: true,
    },
  });

  console.log('Created admin user:', admin.email);

  // Create demo user
  const demoPassword = await bcrypt.hash('demo123', 10);
  const demo = await prisma.user.upsert({
    where: { email: 'demo@admetrics.com' },
    update: {},
    create: {
      email: 'demo@admetrics.com',
      username: 'demo',
      fullName: 'Demo User',
      password: demoPassword,
      role: 'manager',
      isActive: true,
      emailVerified: true,
      company: 'Demo Company',
    },
  });

  console.log('Created demo user:', demo.email);

  console.log('Database seed completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });