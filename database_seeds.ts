// backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function seedUsers() {
  console.log('🌱 Seeding users...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@admetrics.ai' },
    update: {},
    create: {
      email: 'admin@admetrics.ai',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      emailVerified: true,
    },
  });

  // Create demo user
  const demoPassword = await bcrypt.hash('demo123', 10);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@admetrics.ai' },
    update: {},
    create: {
      email: 'demo@admetrics.ai',
      name: 'Demo User',
      password: demoPassword,
      role: 'USER',
      emailVerified: true,
    },
  });

  console.log('✅ Users seeded');
  return { admin, demoUser };
}

async function seedOrganizations(users: any) {
  console.log('🌱 Seeding organizations...');

  const organization = await prisma.organization.create({
    data: {
      name: 'AdMetrics Demo',
      slug: 'admetrics-demo',
      domain: 'admetrics.ai',
      members: {
        create: [
          {
            userId: users.admin.id,
            role: 'OWNER',
          },
          {
            userId: users.demoUser.id,
            role: 'MEMBER',
          },
        ],
      },
    },
  });

  console.log('✅ Organizations seeded');
  return organization;
}

async function seedIntegrations(users: any, organization: any) {
  console.log('🌱 Seeding integrations...');

  const integrations = await Promise.all([
    prisma.integration.create({
      data: {
        userId: users.demoUser.id,
        organizationId: organization.id,
        platform: 'GOOGLE_ADS',
        name: 'Demo Google Ads Account',
        status: 'CONNECTED',
        credentials: {
          customerId: 'demo-customer-id',
          encrypted: true,
        },
        config: {
          syncFrequency: 'HOURLY',
          enabledMetrics: ['spend', 'clicks', 'conversions', 'impressions'],
        },
        scopes: ['ADWORDS_READONLY'],
        lastSyncAt: new Date(),
      },
    }),
    prisma.integration.create({
      data: {
        userId: users.demoUser.id,
        organizationId: organization.id,
        platform: 'FACEBOOK_ADS',
        name: 'Demo Facebook Ads Account',
        status: 'CONNECTED',
        credentials: {
          accountId: 'demo-account-id',
          encrypted: true,
        },
        config: {
          syncFrequency: 'HOURLY',
          enabledMetrics: ['spend', 'clicks', 'conversions', 'impressions'],
        },
        scopes: ['ads_read'],
        lastSyncAt: new Date(),
      },
    }),
  ]);

  console.log('✅ Integrations seeded');
  return integrations;
}

async function seedCampaigns(users: any, integrations: any) {
  console.log('🌱 Seeding campaigns...');

  const campaigns = [];
  
  // Google Ads campaigns
  for (let i = 1; i <= 5; i++) {
    const campaign = await prisma.campaign.create({
      data: {
        externalId: `google-campaign-${i}`,
        name: `Google Campaign ${i}`,
        platform: 'GOOGLE_ADS',
        status: faker.helpers.arrayElement(['ACTIVE', 'PAUSED']),
        objective: faker.helpers.arrayElement(['CONVERSIONS', 'TRAFFIC', 'BRAND_AWARENESS']),
        budget: faker.number.float({ min: 100, max: 5000, precision: 0.01 }),
        budgetType: 'DAILY',
        startDate: faker.date.past({ years: 1 }),
        userId: users.demoUser.id,
        integrationId: integrations[0].id,
        targeting: {
          locations: ['United States', 'Canada'],
          ageRange: '25-54',
          keywords: faker.lorem.words(5).split(' '),
        },
      },
    });
    campaigns.push(campaign);
  }

  // Facebook Ads campaigns
  for (let i = 1; i <= 5; i++) {
    const campaign = await prisma.campaign.create({
      data: {
        externalId: `facebook-campaign-${i}`,
        name: `Facebook Campaign ${i}`,
        platform: 'FACEBOOK_ADS',
        status: faker.helpers.arrayElement(['ACTIVE', 'PAUSED']),
        objective: faker.helpers.arrayElement(['CONVERSIONS', 'TRAFFIC', 'ENGAGEMENT']),
        budget: faker.number.float({ min: 100, max: 5000, precision: 0.01 }),
        budgetType: 'DAILY',
        startDate: faker.date.past({ years: 1 }),
        userId: users.demoUser.id,
        integrationId: integrations[1].id,
        targeting: {
          interests: faker.lorem.words(3).split(' '),
          behaviors: faker.lorem.words(2).split(' '),
          demographics: 'Adults 25-54',
        },
      },
    });
    campaigns.push(campaign);
  }

  console.log('✅ Campaigns seeded');
  return campaigns;
}

async function seedMetrics(campaigns: any, integrations: any) {
  console.log('🌱 Seeding metrics...');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90); // Last 90 days

  for (const campaign of campaigns) {
    const integration = integrations.find((i: any) => i.id === campaign.integrationId);
    
    for (let d = new Date(startDate); d <= new Date(); d.setDate(d.getDate() + 1)) {
      const impressions = faker.number.int({ min: 1000, max: 50000 });
      const clicks = faker.number.int({ min: 10, max: Math.floor(impressions * 0.1) });
      const spend = faker.number.float({ min: 10, max: 500, precision: 0.01 });
      const conversions = faker.number.int({ min: 0, max: Math.floor(clicks * 0.1) });
      const revenue = conversions * faker.number.float({ min: 10, max: 100, precision: 0.01 });

      const ctr = (clicks / impressions) * 100;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpm = (spend / impressions) * 1000;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const roas = spend > 0 ? revenue / spend : 0;

      await prisma.metric.create({
        data: {
          campaignId: campaign.id,
          integrationId: integration.id,
          date: new Date(d),
          platform: campaign.platform,
          metricType: 'DAILY',
          impressions: BigInt(impressions),
          clicks: BigInt(clicks),
          spend,
          conversions,
          revenue,
          ctr: parseFloat(ctr.toFixed(4)),
          cpc: parseFloat(cpc.toFixed(2)),
          cpm: parseFloat(cpm.toFixed(2)),
          cpa: parseFloat(cpa.toFixed(2)),
          roas: parseFloat(roas.toFixed(2)),
          roi: parseFloat(((roas - 1) * 100).toFixed(2)),
          qualityScore: faker.number.float({ min: 1, max: 10, precision: 0.1 }),
          platformData: {
            adGroupCount: faker.number.int({ min: 1, max: 10 }),
            keywordCount: faker.number.int({ min: 5, max: 50 }),
          },
        },
      });
    }
  }

  console.log('✅ Metrics seeded');
}

async function seedAIInsights(campaigns: any) {
  console.log('🌱 Seeding AI insights...');

  const insightTypes = ['PERFORMANCE', 'OPTIMIZATION', 'ANOMALY', 'PREDICTION', 'RECOMMENDATION'];
  const categories = ['BUDGET', 'TARGETING', 'CREATIVE', 'BIDDING', 'SCHEDULING'];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

  for (const campaign of campaigns.slice(0, 5)) {
    await prisma.aIInsight.create({
      data: {
        campaignId: campaign.id,
        type: faker.helpers.arrayElement(insightTypes),
        category: faker.helpers.arrayElement(categories),
        title: `${faker.helpers.arrayElement(['Increase', 'Optimize', 'Adjust'])} ${faker.helpers.arrayElement(['Budget', 'Targeting', 'Bids'])}`,
        description: faker.lorem.sentences(2),
        confidence: faker.number.float({ min: 0.7, max: 0.99, precision: 0.01 }),
        priority: faker.helpers.arrayElement(priorities),
        recommendations: [
          {
            action: faker.lorem.sentence(),
            impact: faker.helpers.arrayElement(['High', 'Medium', 'Low']),
            effort: faker.helpers.arrayElement(['Low', 'Medium', 'High']),
          },
        ],
        impact: {
          expectedIncrease: faker.number.float({ min: 5, max: 30, precision: 0.1 }),
          metric: faker.helpers.arrayElement(['ROAS', 'Conversions', 'CTR']),
          confidence: faker.number.float({ min: 0.6, max: 0.9, precision: 0.01 }),
        },
        status: 'ACTIVE',
      },
    });
  }

  console.log('✅ AI insights seeded');
}

async function seedDashboards(users: any) {
  console.log('🌱 Seeding dashboards...');

  await prisma.dashboard.create({
    data: {
      userId: users.demoUser.id,
      name: 'Main Dashboard',
      description: 'Primary dashboard for campaign monitoring',
      layout: {
        widgets: [
          { id: 'metrics-overview', type: 'metrics', position: { x: 0, y: 0, w: 12, h: 4 } },
          { id: 'performance-chart', type: 'chart', position: { x: 0, y: 4, w: 8, h: 6 } },
          { id: 'platform-comparison', type: 'chart', position: { x: 8, y: 4, w: 4, h: 6 } },
          { id: 'top-campaigns', type: 'table', position: { x: 0, y: 10, w: 12, h: 6 } },
        ],
      },
      widgets: {
        'metrics-overview': {
          title: 'Key Metrics',
          metrics: ['spend', 'clicks', 'conversions', 'roas'],
        },
        'performance-chart': {
          title: 'Performance Trend',
          chartType: 'line',
          metrics: ['spend', 'clicks'],
        },
        'platform-comparison': {
          title: 'Platform Performance',
          chartType: 'bar',
          metric: 'roas',
        },
        'top-campaigns': {
          title: 'Top Campaigns',
          sortBy: 'roas',
          limit: 10,
        },
      },
      filters: {
        dateRange: 'last_30_days',
        platforms: ['GOOGLE_ADS', 'FACEBOOK_ADS'],
      },
    },
  });

  console.log('✅ Dashboards seeded');
}

async function seedMLModels() {
  console.log('🌱 Seeding ML models...');

  await prisma.mLModel.create({
    data: {
      name: 'Performance Predictor',
      version: '1.0.0',
      type: 'TIME_SERIES',
      description: 'LSTM-based model for predicting campaign performance',
      algorithm: 'LSTM Neural Network',
      features: ['spend', 'clicks', 'impressions', 'day_of_week', 'month'],
      performance: {
        mae: 0.15,
        mse: 0.045,
        r2: 0.87,
        mape: 12.3,
      },
      modelPath: '/models/performance_predictor_v1.pkl',
      config: {
        sequence_length: 30,
        hidden_units: [128, 64, 32],
        dropout: 0.3,
        epochs: 100,
      },
      trainedAt: new Date(),
      trainingData: {
        records: 50000,
        features: 25,
        date_range: '2022-01-01 to 2023-12-31',
      },
      isActive: true,
      isDeployed: true,
    },
  });

  await prisma.mLModel.create({
    data: {
      name: 'Budget Optimizer',
      version: '1.0.0',
      type: 'CLASSIFICATION',
      description: 'Random Forest model for budget allocation optimization',
      algorithm: 'Random Forest',
      features: ['historical_roas', 'spend_trend', 'platform', 'objective'],
      performance: {
        accuracy: 0.84,
        precision: 0.81,
        recall: 0.78,
        f1: 0.79,
      },
      modelPath: '/models/budget_optimizer_v1.pkl',
      config: {
        n_estimators: 100,
        max_depth: 10,
        min_samples_split: 5,
      },
      trainedAt: new Date(),
      trainingData: {
        records: 25000,
        features: 15,
        date_range: '2022-01-01 to 2023-12-31',
      },
      isActive: true,
      isDeployed: true,
    },
  });

  console.log('✅ ML models seeded');
}

async function main() {
  console.log('🚀 Starting database seeding...');
  console.log('');

  try {
    const users = await seedUsers();
    const organization = await seedOrganizations(users);
    const integrations = await seedIntegrations(users, organization);
    const campaigns = await seedCampaigns(users, integrations);
    
    await seedMetrics(campaigns, integrations);
    await seedAIInsights(campaigns);
    await seedDashboards(users);
    await seedMLModels();

    console.log('');
    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('📊 Demo credentials:');
    console.log('  Email: demo@admetrics.ai');
    console.log('  Password: demo123');
    console.log('');
    console.log('🔑 Admin credentials:');
    console.log('  Email: admin@admetrics.ai');
    console.log('  Password: admin123');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

---

// backend/scripts/db-backup.sh
#!/bin/bash

# Database backup script
set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATABASE_URL=${DATABASE_URL}

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

echo "Creating database backup..."
pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE.gz"

# Optional: Upload to S3 or other cloud storage
if [ -n "$S3_BUCKET" ]; then
  echo "Uploading to S3..."
  aws s3 cp "$BACKUP_FILE.gz" "s3://$S3_BUCKET/backups/"
  echo "Backup uploaded to S3"
fi

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "db_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed successfully"

---

// backend/scripts/db-restore.sh
#!/bin/bash

# Database restore script
set -e

BACKUP_FILE="$1"
DATABASE_URL=${DATABASE_URL}

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file $BACKUP_FILE not found"
  exit 1
fi

echo "Restoring database from $BACKUP_FILE..."

# If file is compressed, decompress first
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
else
  psql "$DATABASE_URL" < "$BACKUP_FILE"
fi

echo "Database restored successfully"

---

// backend/scripts/migrate.sh
#!/bin/bash

# Database migration script
set -e

echo "Running database migrations..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

# Run Prisma migrations
npx prisma migrate deploy

echo "Migrations completed successfully"

# Optional: Seed database
if [ "$SEED_DATABASE" = "true" ]; then
  echo "Seeding database..."
  npx prisma db seed
  echo "Database seeded successfully"
fi

---

// package.json (root)
{
  "name": "admetrics-ai-dashboard",
  "version": "1.0.0",
  "description": "AdMetrics AI Dashboard - Intelligent Advertising Campaign Analytics",
  "private": true,
  "workspaces": [
    "backend",
    "frontend",
    "shared"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\" \"npm run dev:ai\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm start",
    "dev:ai": "cd ai-engine && source venv/bin/activate && python src/api/app.py",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend && npm run test:ai",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test -- --watchAll=false",
    "test:ai": "cd ai-engine && python -m pytest",
    "test:e2e": "cd frontend && npm run test:e2e",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "lint:fix": "npm run lint:backend -- --fix && npm run lint:frontend -- --fix",
    "format": "prettier --write \"**/*.{js,jsx,ts,tsx,json,md}\"",
    "type-check": "npm run type-check:backend && npm run type-check:frontend",
    "type-check:backend": "cd backend && npm run type-check",
    "type-check:frontend": "cd frontend && npm run type-check",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "setup": "chmod +x setup.sh && ./setup.sh",
    "setup:dev": "chmod +x scripts/dev-setup.sh && ./scripts/dev-setup.sh",
    "backup": "chmod +x scripts/backup.sh && ./scripts/backup.sh",
    "health-check": "chmod +x scripts/health-check.sh && ./scripts/health-check.sh",
    "deploy:staging": "chmod +x scripts/deploy.sh && ./scripts/deploy.sh staging",
    "deploy:production": "chmod +x scripts/deploy.sh && ./scripts/deploy.sh production",
    "clean": "npm run clean:backend && npm run clean:frontend && npm run clean:docker",
    "clean:backend": "cd backend && rm -rf dist node_modules",
    "clean:frontend": "cd frontend && rm -rf build node_modules",
    "clean:docker": "docker system prune -f",
    "update-deps": "npm update && cd backend && npm update && cd ../frontend && npm update"
  },
  "devDependencies": {
    "concurrently": "^8.2.0",
    "prettier": "^3.0.2",
    "@commitlint/cli": "^17.7.1",
    "@commitlint/config-conventional": "^17.7.0",
    "husky": "^8.0.3",
    "lint-staged": "^14.0.1"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/admetrics-ai-dashboard.git"
  },
  "keywords": [
    "advertising",
    "analytics",
    "ai",
    "dashboard",
    "metrics",
    "campaigns",
    "google-ads",
    "facebook-ads",
    "react",
    "nodejs",
    "python",
    "machine-learning"
  ],
  "author": "AdMetrics Team <dev@admetrics.ai>",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/your-org/admetrics-ai-dashboard/issues"
  },
  "homepage": "https://admetrics.ai"
}