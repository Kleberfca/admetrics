# AdMetrics AI Dashboard - Estrutura do Projeto

## Arquitetura Geral
```
admetrics-ai-dashboard/
├── backend/                    # API Backend (Node.js/TypeScript)
├── frontend/                   # Dashboard Frontend (React/TypeScript)
├── ai-engine/                  # Modelos de IA (Python/Flask)
├── data-pipeline/              # ETL e processamento de dados
├── infrastructure/             # Docker, Kubernetes, CI/CD
├── docs/                      # Documentação
└── shared/                    # Tipos e utilitários compartilhados
```

## Detalhamento da Estrutura

### 1. Backend (Node.js/Express + TypeScript)
```
backend/
├── src/
│   ├── controllers/           # Controladores da API
│   │   ├── auth.controller.ts
│   │   ├── campaigns.controller.ts
│   │   ├── metrics.controller.ts
│   │   ├── integrations.controller.ts
│   │   └── reports.controller.ts
│   ├── services/              # Lógica de negócio
│   │   ├── auth.service.ts
│   │   ├── campaigns.service.ts
│   │   ├── metrics.service.ts
│   │   ├── integrations/
│   │   │   ├── google-ads.service.ts
│   │   │   ├── facebook-ads.service.ts
│   │   │   ├── tiktok-ads.service.ts
│   │   │   ├── linkedin-ads.service.ts
│   │   │   └── platform-manager.service.ts
│   │   ├── ai-insights.service.ts
│   │   └── data-quality.service.ts
│   ├── models/                # Modelos de dados (Prisma/TypeORM)
│   │   ├── user.model.ts
│   │   ├── campaign.model.ts
│   │   ├── metrics.model.ts
│   │   └── integration.model.ts
│   ├── middleware/            # Middlewares
│   │   ├── auth.middleware.ts
│   │   ├── validation.middleware.ts
│   │   └── rate-limit.middleware.ts
│   ├── utils/                 # Utilitários
│   │   ├── logger.ts
│   │   ├── encryption.ts
│   │   └── data-normalizer.ts
│   ├── config/               # Configurações
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── api-keys.ts
│   └── app.ts                # Aplicação principal
├── tests/                    # Testes
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

### 2. Frontend (React + TypeScript)
```
frontend/
├── src/
│   ├── components/           # Componentes reutilizáveis
│   │   ├── common/
│   │   │   ├── Header/
│   │   │   ├── Sidebar/
│   │   │   ├── Loading/
│   │   │   └── ErrorBoundary/
│   │   ├── charts/          # Componentes de gráficos
│   │   │   ├── LineChart/
│   │   │   ├── BarChart/
│   │   │   ├── PieChart/
│   │   │   └── HeatMap/
│   │   ├── metrics/         # Componentes de métricas
│   │   │   ├── MetricCard/
│   │   │   ├── MetricTable/
│   │   │   └── MetricComparison/
│   │   └── integrations/    # Componentes de integração
│   │       ├── PlatformCard/
│   │       └── IntegrationWizard/
│   ├── pages/               # Páginas principais
│   │   ├── Dashboard/
│   │   ├── Campaigns/
│   │   ├── Analytics/
│   │   ├── Integrations/
│   │   ├── Reports/
│   │   └── Settings/
│   ├── hooks/               # Custom hooks
│   │   ├── useMetrics.ts
│   │   ├── useRealTimeData.ts
│   │   └── useIntegrations.ts
│   ├── services/            # Serviços de API
│   │   ├── api.service.ts
│   │   ├── auth.service.ts
│   │   └── websocket.service.ts
│   ├── store/               # Estado global (Redux/Zustand)
│   │   ├── slices/
│   │   └── index.ts
│   ├── utils/               # Utilitários
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   └── constants.ts
│   ├── types/               # Tipos TypeScript
│   └── styles/              # Estilos (Tailwind/Styled-components)
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── Dockerfile
```

### 3. AI Engine (Python/Flask)
```
ai-engine/
├── src/
│   ├── models/              # Modelos de IA
│   │   ├── prediction/
│   │   │   ├── performance_predictor.py
│   │   │   ├── budget_optimizer.py
│   │   │   └── anomaly_detector.py
│   │   ├── optimization/
│   │   │   ├── bid_optimizer.py
│   │   │   ├── audience_segmenter.py
│   │   │   └── creative_optimizer.py
│   │   └── nlp/
│   │       ├── sentiment_analyzer.py
│   │       └── content_generator.py
│   ├── services/           # Serviços de IA
│   │   ├── training.service.py
│   │   ├── inference.service.py
│   │   └── feedback.service.py
│   ├── data/              # Processamento de dados
│   │   ├── preprocessors.py
│   │   ├── feature_engineering.py
│   │   └── data_validators.py
│   ├── api/               # API Flask
│   │   ├── routes/
│   │   └── app.py
│   └── utils/
│       ├── model_utils.py
│       └── metrics.py
├── models/                # Modelos treinados salvos
├── notebooks/             # Jupyter notebooks para experimentação
├── requirements.txt
├── Dockerfile
└── config.yaml
```

### 4. Data Pipeline
```
data-pipeline/
├── src/
│   ├── extractors/          # Extração de dados
│   │   ├── google_ads_extractor.py
│   │   ├── facebook_ads_extractor.py
│   │   └── base_extractor.py
│   ├── transformers/        # Transformação de dados
│   │   ├── data_normalizer.py
│   │   ├── metric_calculator.py
│   │   └── data_validator.py
│   ├── loaders/            # Carregamento de dados
│   │   ├── database_loader.py
│   │   └── cache_loader.py
│   ├── schedulers/         # Agendamento de tarefas
│   │   ├── cron_jobs.py
│   │   └── real_time_processor.py
│   └── config/
│       └── pipeline_config.yaml
├── docker-compose.yml
└── requirements.txt
```

### 5. Infrastructure
```
infrastructure/
├── docker/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   └── nginx/
│       └── nginx.conf
├── kubernetes/
│   ├── deployments/
│   ├── services/
│   └── ingress/
├── terraform/             # Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
└── ci-cd/
    ├── .github/workflows/
    └── jenkins/
```

### 6. Shared
```
shared/
├── types/                 # Tipos compartilhados
│   ├── api.types.ts
│   ├── metrics.types.ts
│   └── platform.types.ts
├── constants/            # Constantes
│   ├── platforms.ts
│   ├── metrics.ts
│   └── api-endpoints.ts
└── utils/               # Utilitários compartilhados
    ├── formatters.ts
    └── validators.ts
```

## Tecnologias Principais

### Backend
- **Framework:** Node.js + Express + TypeScript
- **Banco de Dados:** PostgreSQL (dados estruturados) + Redis (cache)
- **ORM:** Prisma
- **Autenticação:** JWT + OAuth2
- **Validação:** Joi/Zod
- **Documentação:** Swagger/OpenAPI

### Frontend
- **Framework:** React 18 + TypeScript
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Charts:** Recharts + D3.js
- **Forms:** React Hook Form
- **Routing:** React Router v6

### AI/ML
- **Framework:** Python + Flask
- **ML Libraries:** scikit-learn, pandas, numpy
- **Deep Learning:** TensorFlow/PyTorch
- **Time Series:** Prophet, ARIMA
- **NLP:** spaCy, NLTK

### DevOps
- **Containerização:** Docker + Docker Compose
- **Orquestração:** Kubernetes
- **CI/CD:** GitHub Actions
- **Monitoramento:** Prometheus + Grafana
- **Logs:** ELK Stack (Elasticsearch, Logstash, Kibana)

## Próximos Passos

1. **Configuração do ambiente de desenvolvimento**
2. **Implementação do MVP (Google Ads + Facebook Ads)**
3. **Desenvolvimento da IA básica (previsões)**
4. **Expansão para outras plataformas**
5. **Funcionalidades avançadas de IA**

---

Esta estrutura fornece uma base sólida e escalável para o desenvolvimento do dashboard de métricas com IA, seguindo as melhores práticas de arquitetura de software e DevOps.