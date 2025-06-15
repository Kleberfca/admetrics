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
- **Real-Time Dashboard**: Customizable dashboards with live metrics updates
- **Automated Reporting**: Schedule and generate comprehensive reports in multiple formats
- **Budget Optimization**: AI-driven budget allocation across campaigns
- **Audience Segmentation**: Smart audience clustering for targeted campaigns
- **Creative Analysis**: Performance analysis and optimization for ad creatives
- **Sentiment Analysis**: Monitor and analyze customer feedback across platforms

## 🏗️ Architecture
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│   AI Engine     │
│   (Next.js)     │     │   (FastAPI)     │     │   (FastAPI)     │
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
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **Task Queue**: Celery
- **Authentication**: JWT + OAuth2

### AI Engine
- **Framework**: FastAPI
- **ML Libraries**: scikit-learn, Prophet, spaCy
- **Deep Learning**: PyTorch, Transformers

### Frontend
- **Framework**: Next.js 14 (React 18)
- **UI Library**: Material-UI v5
- **State Management**: Redux Toolkit
- **Charts**: Recharts, Chart.js
- **Real-time**: WebSocket

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Reverse Proxy**: Nginx
- **Storage**: AWS S3 (reports)
- **Monitoring**: Prometheus + Grafana

## 🚀 Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for local development)
- PostgreSQL 15 (or use Docker)
- Redis 7 (or use Docker)

### Quick Start with Docker

1. Clone the repository:
```bash
git clone https://github.com/yourusername/admetrics.git
cd admetrics

2. Copy environment variables:
cp .env.example .env
# Edit .env with your configuration

3. Build and start services:
docker-compose up -d

4. Initialize the database:
docker-compose exec backend alembic upgrade head
docker-compose exec backend python -m app.db.init_db

5.Access the application:
Frontend: http://localhost:3000
Backend API: http://localhost:8000/docs
AI Engine API: http://localhost:8001/docs
Flower (Celery monitoring): http://localhost:5555

Local Development
Backend Setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

AI Engine Setup
cd ai-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn src.main:app --port 8001 --reload

Frontend Setup
cd frontend
npm install
npm run dev

📚 Documentation
Detailed documentation is available in the /docs directory:

API Documentation
Architecture Guide
Development Guide
Deployment Guide
Contributing Guide

🧪 Testing
Backend Tests
cd backend
pytest
pytest --cov=app --cov-report=html  # With coverage

Frontend Tests
cd frontend
npm test
npm run test:coverage  # With coverage

E2E Tests
cd e2e
npm install
npm run test

🚀 Deployment
Production Deployment

1. Set production environment variables
2. Build production images:
docker-compose -f docker-compose.prod.yml build

3. Deploy with Docker Swarm or Kubernetes:
# Docker Swarm
docker stack deploy -c docker-compose.prod.yml admetrics

# Kubernetes
kubectl apply -f k8s/

See Deployment Guide for detailed instructions.
🤝 Contributing
We welcome contributions! Please see our Contributing Guide for details.

1. Fork the repository
2. Create your feature branch (git checkout -b feature/amazing-feature)
3. Commit your changes (git commit -m 'Add amazing feature')
4. Push to the branch (git push origin feature/amazing-feature)
5. Open a Pull Request

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

Made with ❤️ by the AdMetrics Team
## RESUMO DOS ARQUIVOS CRIADOS NESTA CONTINUAÇÃO:

1. **api.ts** (frontend) - Cliente API principal do frontend
2. **useWebSocket.ts** (frontend) - Hook para conexões WebSocket
3. **worker.py** (backend) - Configuração e tarefas do Celery
4. **Dockerfile** (backend) - Dockerfile para o backend
5. **Dockerfile** (ai-engine) - Dockerfile para o AI Engine
6. **Dockerfile** (frontend) - Dockerfile para o frontend
7. **nginx.conf** - Configuração principal do Nginx
8. **default.conf** (nginx) - Configuração do servidor Nginx
9. **.env.example** - Exemplo de variáveis de ambiente
10. **README.md** - Documentação principal do projeto

Todos os arquivos essenciais do projeto AdMetrics foram criados! O sistema está completo com:

- ✅ Backend completo com FastAPI
- ✅ AI Engine com modelos de ML
- ✅ Frontend com Next.js
- ✅ Configuração Docker completa
- ✅ Nginx como reverse proxy
- ✅ Workers Celery para tarefas assíncronas
- ✅ WebSocket para atualizações em tempo real
- ✅ Documentação abrangente

O projeto está pronto para desenvolvimento e deployment!

