# ai-engine/src/api/app.py
import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import redis
from prophet import Prophet

# Add src to path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from models.prediction.performance_predictor import PerformancePredictor
from models.prediction.budget_optimizer import BudgetOptimizer
from models.prediction.anomaly_detector import AnomalyDetector
from models.optimization.audience_segmenter import AudienceSegmenter
from models.nlp.sentiment_analyzer import SentimentAnalyzer
from services.training_service import TrainingService
from services.inference_service import InferenceService
from utils.data_processor import DataProcessor
from utils.model_utils import ModelUtils
from utils.logger import setup_logger

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config.update(
    DEBUG=os.getenv('FLASK_DEBUG', 'False').lower() == 'true',
    SECRET_KEY=os.getenv('FLASK_SECRET_KEY', 'dev-secret-key'),
    MAX_CONTENT_LENGTH=50 * 1024 * 1024,  # 50MB max file size
    JSON_SORT_KEYS=False
)

# Setup CORS
CORS(app, origins=os.getenv('ALLOWED_ORIGINS', '*').split(','))

# Setup logging
logger = setup_logger(__name__)

# Initialize Redis connection
try:
    redis_client = redis.Redis.from_url(
        os.getenv('REDIS_URL', 'redis://localhost:6379'),
        decode_responses=True
    )
    redis_client.ping()
    logger.info("Redis connection established")
except Exception as e:
    logger.warning(f"Redis connection failed: {e}")
    redis_client = None

# Initialize services
training_service = TrainingService()
inference_service = InferenceService()
data_processor = DataProcessor()

# Initialize ML models
performance_predictor = PerformancePredictor()
budget_optimizer = BudgetOptimizer()
anomaly_detector = AnomalyDetector()
audience_segmenter = AudienceSegmenter()
sentiment_analyzer = SentimentAnalyzer()

# Error handlers
@app.errorhandler(HTTPException)
def handle_http_exception(e):
    return jsonify({
        'success': False,
        'error': {
            'code': e.code,
            'name': e.name,
            'description': e.description
        }
    }), e.code

@app.errorhandler(Exception)
def handle_general_exception(e):
    logger.error(f"Unhandled exception: {str(e)}", exc_info=True)
    return jsonify({
        'success': False,
        'error': {
            'code': 500,
            'name': 'Internal Server Error',
            'description': 'An unexpected error occurred'
        }
    }), 500

# Request logging
@app.before_request
def log_request():
    g.start_time = datetime.now()
    logger.info(f"{request.method} {request.path} - {request.remote_addr}")

@app.after_request
def log_response(response):
    duration = datetime.now() - g.start_time
    logger.info(f"{request.method} {request.path} - {response.status_code} - {duration.total_seconds():.3f}s")
    return response

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check Redis connection
        redis_status = 'connected' if redis_client and redis_client.ping() else 'disconnected'
        
        # Check model availability
        models_status = {
            'performance_predictor': performance_predictor.is_loaded(),
            'budget_optimizer': budget_optimizer.is_loaded(),
            'anomaly_detector': anomaly_detector.is_loaded(),
            'audience_segmenter': audience_segmenter.is_loaded(),
            'sentiment_analyzer': sentiment_analyzer.is_loaded()
        }
        
        return jsonify({
            'success': True,
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'services': {
                'redis': redis_status,
                'models': models_status
            },
            'version': '1.0.0'
        })
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'success': False,
            'status': 'unhealthy',
            'error': str(e)
        }), 500

# Campaign Analysis Endpoints
@app.route('/insights/campaign-analysis', methods=['POST'])
def analyze_campaign():
    """Analyze campaign performance and generate insights"""
    try:
        data = request.get_json()
        
        if not data or 'campaign' not in data or 'metrics' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: campaign and metrics'
            }), 400
        
        campaign_data = data['campaign']
        metrics_data = data['metrics']
        
        # Process metrics data
        df_metrics = pd.DataFrame(metrics_data)
        
        if df_metrics.empty:
            return jsonify({
                'success': False,
                'error': 'No metrics data provided'
            }), 400
        
        # Generate insights
        insights = inference_service.analyze_campaign(campaign_data, df_metrics)
        
        return jsonify({
            'success': True,
            'insights': insights,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Campaign analysis failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Performance Prediction Endpoints
@app.route('/predictions/performance', methods=['POST'])
def predict_performance():
    """Predict campaign performance for future periods"""
    try:
        data = request.get_json()
        
        required_fields = ['campaignId', 'historical_data', 'prediction_days']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {required_fields}'
            }), 400
        
        campaign_id = data['campaignId']
        historical_data = data['historical_data']
        prediction_days = data['prediction_days']
        platform = data.get('platform', 'UNKNOWN')
        campaign_info = data.get('campaign_info', {})
        
        # Convert to DataFrame
        df = pd.DataFrame(historical_data)
        df['date'] = pd.to_datetime(df['date'])
        
        # Make predictions
        predictions = performance_predictor.predict(
            df=df,
            days=prediction_days,
            platform=platform,
            campaign_info=campaign_info
        )
        
        return jsonify({
            'success': True,
            'campaign_id': campaign_id,
            'spend_forecast': predictions['spend'].tolist(),
            'clicks_forecast': predictions['clicks'].tolist(),
            'conversions_forecast': predictions['conversions'].tolist(),
            'roas_forecast': predictions['roas'].tolist(),
            'dates': [d.isoformat() for d in predictions['dates']],
            'confidence': predictions['confidence'],
            'factors': predictions.get('factors', []),
            'recommendations': predictions.get('recommendations', []),
            'model_version': performance_predictor.get_version(),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Performance prediction failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Budget Optimization Endpoints
@app.route('/optimization/budget', methods=['POST'])
def optimize_budget():
    """Optimize budget allocation across campaigns"""
    try:
        data = request.get_json()
        
        required_fields = ['campaigns', 'totalBudget']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {required_fields}'
            }), 400
        
        campaigns = data['campaigns']
        total_budget = data['totalBudget']
        constraints = data.get('constraints', {})
        
        # Optimize budget allocation
        optimization_result = budget_optimizer.optimize(
            campaigns=campaigns,
            total_budget=total_budget,
            constraints=constraints
        )
        
        return jsonify({
            'success': True,
            'expected_improvement': optimization_result['expected_improvement'],
            'reallocation': optimization_result['reallocation'],
            'risk_level': optimization_result['risk_level'],
            'implementation_steps': optimization_result['implementation_steps'],
            'confidence': optimization_result['confidence'],
            'model_version': budget_optimizer.get_version(),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Budget optimization failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Anomaly Detection Endpoints
@app.route('/anomalies/detect', methods=['POST'])
def detect_anomalies():
    """Detect anomalies in campaign performance"""
    try:
        data = request.get_json()
        
        if not data or 'metrics' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: metrics'
            }), 400
        
        campaign_id = data.get('campaignId', 'unknown')
        metrics_data = data['metrics']
        
        # Convert to DataFrame
        df = pd.DataFrame(metrics_data)
        df['date'] = pd.to_datetime(df['date'])
        
        # Detect anomalies
        anomalies = anomaly_detector.detect(df)
        
        return jsonify({
            'success': True,
            'campaign_id': campaign_id,
            'detected_anomalies': anomalies,
            'model_version': anomaly_detector.get_version(),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Audience Analysis Endpoints
@app.route('/audience/analyze', methods=['POST'])
def analyze_audience():
    """Analyze and segment audience data"""
    try:
        data = request.get_json()
        
        required_fields = ['platform', 'campaigns']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': f'Missing required fields: {required_fields}'
            }), 400
        
        platform = data['platform']
        campaigns = data['campaigns']
        
        # Analyze audience segments
        analysis_result = audience_segmenter.analyze(
            platform=platform,
            campaigns=campaigns
        )
        
        return jsonify({
            'success': True,
            'segments': analysis_result['segments'],
            'insights': analysis_result['insights'],
            'model_version': audience_segmenter.get_version(),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Audience analysis failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Sentiment Analysis Endpoints
@app.route('/sentiment/analyze', methods=['POST'])
def analyze_sentiment():
    """Analyze sentiment of social media content"""
    try:
        data = request.get_json()
        
        if not data or 'content' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: content'
            }), 400
        
        content = data['content']
        platform = data.get('platform', 'unknown')
        
        # Analyze sentiment
        sentiment_result = sentiment_analyzer.analyze(content, platform)
        
        return jsonify({
            'success': True,
            'sentiment': sentiment_result,
            'model_version': sentiment_analyzer.get_version(),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Sentiment analysis failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Model Training Endpoints
@app.route('/models/train', methods=['POST'])
def train_models():
    """Train or retrain ML models"""
    try:
        data = request.get_json()
        
        model_type = data.get('model_type', 'all')
        training_data = data.get('training_data', {})
        
        # Start training process
        training_result = training_service.train_models(
            model_type=model_type,
            training_data=training_data
        )
        
        return jsonify({
            'success': True,
            'training_result': training_result,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Model training failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Model Status Endpoints
@app.route('/models/status', methods=['GET'])
def get_models_status():
    """Get status of all ML models"""
    try:
        models_status = {
            'performance_predictor': {
                'loaded': performance_predictor.is_loaded(),
                'version': performance_predictor.get_version(),
                'last_trained': performance_predictor.get_last_trained(),
                'accuracy': performance_predictor.get_accuracy()
            },
            'budget_optimizer': {
                'loaded': budget_optimizer.is_loaded(),
                'version': budget_optimizer.get_version(),
                'last_trained': budget_optimizer.get_last_trained()
            },
            'anomaly_detector': {
                'loaded': anomaly_detector.is_loaded(),
                'version': anomaly_detector.get_version(),
                'last_trained': anomaly_detector.get_last_trained(),
                'accuracy': anomaly_detector.get_accuracy()
            },
            'audience_segmenter': {
                'loaded': audience_segmenter.is_loaded(),
                'version': audience_segmenter.get_version(),
                'last_trained': audience_segmenter.get_last_trained()
            },
            'sentiment_analyzer': {
                'loaded': sentiment_analyzer.is_loaded(),
                'version': sentiment_analyzer.get_version(),
                'last_trained': sentiment_analyzer.get_last_trained(),
                'accuracy': sentiment_analyzer.get_accuracy()
            }
        }
        
        return jsonify({
            'success': True,
            'models': models_status,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Getting model status failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Data Processing Endpoints
@app.route('/data/process', methods=['POST'])
def process_data():
    """Process and clean data for ML models"""
    try:
        data = request.get_json()
        
        if not data or 'raw_data' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: raw_data'
            }), 400
        
        raw_data = data['raw_data']
        processing_type = data.get('type', 'metrics')
        
        # Process data
        processed_data = data_processor.process(raw_data, processing_type)
        
        return jsonify({
            'success': True,
            'processed_data': processed_data,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Data processing failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Utility endpoints
@app.route('/utils/validate-data', methods=['POST'])
def validate_data():
    """Validate data format for ML models"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        validation_result = ModelUtils.validate_data(data)
        
        return jsonify({
            'success': True,
            'validation': validation_result,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Data validation failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/utils/feature-importance', methods=['POST'])
def get_feature_importance():
    """Get feature importance for specific model"""
    try:
        data = request.get_json()
        
        model_type = data.get('model_type', 'performance_predictor')
        
        # Get feature importance
        importance = ModelUtils.get_feature_importance(model_type)
        
        return jsonify({
            'success': True,
            'feature_importance': importance,
            'model_type': model_type,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Getting feature importance failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Initialize models on startup
@app.before_first_request
def initialize_models():
    """Initialize ML models on application startup"""
    try:
        logger.info("Initializing ML models...")
        
        # Load pre-trained models if available
        performance_predictor.load_model()
        budget_optimizer.load_model()
        anomaly_detector.load_model()
        audience_segmenter.load_model()
        sentiment_analyzer.load_model()
        
        logger.info("ML models initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")

if __name__ == '__main__':
    # Get configuration from environment
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    port = int(os.getenv('FLASK_PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting AI Engine on {host}:{port}")
    
    # Run the Flask app
    app.run(
        host=host,
        port=port,
        debug=debug,
        threaded=True
    )