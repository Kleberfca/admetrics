# AdMetrics - AI-Powered Advertising Analytics Platform

<p align="center">
  <img src="docs/images/logo.png" alt="AdMetrics Logo" width="200"/>
</p>

<p align="center">
  <a href="https://github.com/yourusername/admetrics/actions">
    <img src="https://github.com/yourusername/admetrics/workflows/CI/badge.svg" alt="CI Status">
  </a>
  <a href="https://codecov.io/gh/yourusername/admetrics">
    <img src="https://codecov.io/gh/yourusername/admetrics/branch/main/graph/badge.svg" alt="Coverage">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
</p>

## 🚀 Overview

AdMetrics is a comprehensive advertising analytics platform that centralizes campaign data from multiple advertising platforms (Google Ads, Facebook Ads, TikTok, etc.) and uses AI to optimize performance, detect anomalies, and provide actionable insights.

### ✨ Key Features

- **Multi-Platform Integration**: Connect and sync data from 9+ advertising platforms
- **AI-Powered Insights**: Predictive analytics, anomaly detection, and optimization recommendations
- **Real-Time Dashboard**: Customizable dashboards with live metrics updates via WebSocket
- **Automated Reporting**: Schedule and generate comprehensive reports in multiple formats
- **Budget Optimization**: AI-driven budget allocation across campaigns
- **Audience Segmentation**: Smart audience clustering for targeted campaigns
- **Creative Analysis**: Performance analysis and optimization for ad creatives
- **Sentiment Analysis**: Monitor and analyze customer feedback across platforms

## 🏗️ Architecture
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│   AI Engine     │
│   (Next.js)     │     │   (Node.js)     │     │   (Python)      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
│                       │                       │
│                       │                       │
▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│     Nginx       │     │   PostgreSQL    │     │     Redis       │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘

## 🛠️ Tech Stack

### Backend
- **Framework**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 15 + Prisma ORM
- **Cache**: Redis 7
- **Authentication**: JWT + OAuth2
- **Real-time**: Socket.io
- **Validation**: Zod
- **Documentation**: Swagger/OpenAPI

### Frontend
- **Framework**: Next.js 14 + TypeScript
- **UI Library**: Material-UI v5
- **State Management**: Redux Toolkit
- **Charts**: Recharts + Chart.js
- **Forms**: React Hook Form
- **Real-time**: Socket.io-client

### AI Engine
- **Framework**: Python 3.11 + Flask
- **ML Libraries**: scikit-learn, pandas, numpy
- **Deep Learning**: PyTorch, Transformers
- **Time Series**: Prophet, statsmodels
- **NLP**: spaCy, NLTK

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: Nginx
- **Process Manager**: PM2 (production)
- **Monitoring**: Prometheus + Grafana
- **Logging**: Winston + ELK Stack

## 📋 Prerequisites

- Node.js 18+ and npm 9+
- Python 3.11+
- Docker & Docker Compose
- PostgreSQL 15 (or use Docker)
- Redis 7 (or use Docker)

## 🚀 Getting Started

### Quick Start with Docker

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/admetrics.git
cd admetrics

2. Copy environment variables:
cp .env.example .env
# Edit .env with your configuration

3. Build and start services:
docker-compose up -d

4. Run database migrations:
docker-compose exec backend npm run prisma:migrate

5. Access the application:

Frontend: http://localhost:3001
Backend API: http://localhost:3000/api/docs
AI Engine: http://localhost:5000/docs

Local Development

Backend Setup
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

Frontend Setup
cd frontend
npm install
npm run dev

AI Engine Setup
cd ai-engine
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
python src/api/app.py

🔧 Configuration
Platform Integrations

1. Google Ads

Create a Google Ads Developer account
Generate API credentials
Add to .env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET

2. Facebook Ads

Create a Facebook App
Get App ID and Secret
Add to .env: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET

3. Other Platforms
Follow similar steps for TikTok, LinkedIn, Twitter ads

Environment Variables
Key environment variables:
# Backend
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/admetrics
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000

# AI Engine
FLASK_ENV=development
AI_ENGINE_PORT=5000

📚 Documentation

API Documentation
Architecture Guide
Development Guide
Deployment Guide
Contributing Guide

🧪 Testing
Backend Tests
cd backend
npm test                 # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage   # With coverage report

Frontend Tests
cd frontend
npm test               # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage

AI Engine Tests
cd ai-engine
pytest                # Run all tests
pytest --cov         # With coverage

📊 Project Structure
admetrics/
├── backend/                    # Node.js/Express API
│   ├── src/
│   │   ├── controllers/       # Route controllers
│   │   ├── services/          # Business logic
│   │   ├── models/           # Data models
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Custom middleware
│   │   ├── utils/            # Utilities
│   │   └── config/           # Configuration
│   ├── prisma/               # Database schema
│   └── tests/                # Test files
│
├── frontend/                  # Next.js application
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/           # Next.js pages
│   │   ├── hooks/           # Custom hooks
│   │   ├── services/        # API services
│   │   ├── store/           # Redux store
│   │   └── utils/           # Utilities
│   └── public/              # Static assets
│
├── ai-engine/                # Python ML/AI service
│   ├── src/
│   │   ├── models/          # ML models
│   │   ├── services/        # AI services
│   │   ├── api/            # Flask API
│   │   └── utils/          # Utilities
│   └── notebooks/          # Jupyter notebooks
│
├── nginx/                   # Nginx configuration
├── docs/                    # Documentation
└── docker-compose.yml      # Docker configuration

🚀 Deployment
Production with Docker

1. Build production images:
docker-compose -f docker-compose.prod.yml build

2. Deploy:
docker-compose -f docker-compose.prod.yml up -d

Manual Deployment
See Deployment Guide for detailed instructions on:

AWS deployment
Google Cloud deployment
Kubernetes deployment
CI/CD setup

🔒 Security

All API endpoints are protected with JWT authentication
OAuth2 integration for third-party platforms
Data encryption at rest and in transit
Rate limiting and DDoS protection
Regular security audits and dependency updates

🤝 Contributing
We welcome contributions! Please see our Contributing Guide for details.
1. Fork the repository
2. Create your feature branch (git checkout -b feature/amazing-feature)
3. Commit your changes (git commit -m 'Add amazing feature')
4. Push to the branch (git push origin feature/amazing-feature)
5. Open a Pull Request

📈 Roadmap

 Core dashboard functionality
 Google Ads & Facebook Ads integration
 Basic AI predictions
 Advanced ML models
 More platform integrations
 Mobile app
 White-label solution
 Marketplace for custom integrations

 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
🙏 Acknowledgments

Thanks to all contributors who have helped shape AdMetrics
Special thanks to the open-source community for the amazing tools and libraries

📞 Support

Documentation: docs.admetrics.io
Issues: GitHub Issues
Discussions: GitHub Discussions
Email: support@admetrics.io


<p align="center">Made with ❤️ by the AdMetrics Team</p>
```
Este README.md atualizado reflete:
1. Arquitetura Correta: Backend em Node.js/TypeScript, Frontend em Next.js, AI Engine em Python
2. Tech Stack Atualizada: Todas as tecnologias corretas listadas
3. Instruções Claras: Passos detalhados para configuração e desenvolvimento
4. Estrutura do Projeto: Reflete a organização real dos diretórios
5. Documentação Completa: Links para guias adicionais
6. Informações de Deployment: Opções para produção
7. Contribuição e Suporte: Como contribuir e obter ajuda

O README está profissional, completo e alinhado com a estrutura definitiva do projeto usando Node.js/TypeScript no backend.