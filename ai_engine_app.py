#!/usr/bin/env python3
"""
AdMetrics AI Engine
Flask API for AI-powered advertising analytics and optimization
"""

import os
import sys
import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.exceptions import HTTPException
import redis
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import numpy as np
import joblib
from functools import wraps

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.models.prediction.performance_predictor import PerformancePredictor
from src.models.optimization.budget_optimizer import BudgetOptimizer
from src.models.optimization.audience_segmenter import AudienceSegmenter
from src.models.prediction.anomaly_detector import AnomalyDetector
from src.services.training_service import TrainingService
from src.services.inference_service import InferenceService
from src.services.feedback_service import FeedbackService
from src.utils.model_utils import ModelManager
from src.utils.data_validator import DataValidator
from src.utils.metrics_calculator import MetricsCalculator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/app/logs/ai-engine.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config.update(
    SECRET_KEY=os.getenv('SECRET_KEY', 'dev-secret-key'),
    DEBUG=os.getenv('FLASK_DEBUG', '0') == '1',
    TESTING=False,
    JSON_SORT_KEYS=False,
    JSONIFY_PRETTYPRINT_REGULAR=True,
    MAX_CONTENT_LENGTH=16 * 1024 * 1024,  # 16MB max request size
)

# Enable CORS
CORS(app, origins=[
    "http://localhost:3001",  # Frontend development
    "http://localhost:3000",  # Backend development
    os.getenv('FRONTEND_URL', 'https://dashboard.admetrics.ai')
])

# Initialize rate limiting
limiter = Limiter(
    app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri=os.getenv('REDIS_URL', 'redis://localhost:6379/1')
)

# Initialize Redis for caching
try:
    redis_client = redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=int(os.getenv('REDIS_DB', 1)),
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=5,
    )
    redis_client.ping()
    logger.info("Redis connection established")
except Exception as e:
    logger.error(f"Redis connection failed: {e}")
    redis_client = None

# Initialize database connection pool
def get_db_connection():
    """Get PostgreSQL database connection"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=int(os.getenv('DB_PORT', 5432)),
            database=os.getenv('DB_NAME', 'admetrics'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'password'),
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        raise

# Initialize AI services
model_manager = ModelManager()
data_validator = DataValidator()
metrics_calculator = MetricsCalculator()

# Initialize AI services
training_service = TrainingService(model_manager)
inference_service = InferenceService(model_manager, redis_client)
feedback_service = FeedbackService(get_db_connection, redis_client)

# Performance predictor
performance_predictor = PerformancePredictor()
budget_optimizer = BudgetOptimizer()
audience_segmenter = AudienceSegmenter()
anomaly_detector = AnomalyDetector()

# Authentication decorator
def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({
                'success': False,
                'error': 'Authorization token required'
            }), 401
        
        # In production, verify JWT token here
        # For now, we'll accept any Bearer token
        token = auth_header.split(' ')[1]
        if not token:
            return jsonify({
                'success': False,
                'error': 'Invalid authorization token'
            }), 401
            
        return f(*args, **kwargs)
    return decorated_function

# Error handlers
@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return jsonify({
            'success': False,
            'error': e.description,
            'code': e.code
        }), e.code
    
    logger.error(f"Unhandled exception: {e}")
    logger.error(traceback.format_exc())
    
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

@app.errorhandler(429)
def rate_limit_exceeded(error):
    return jsonify({
        'success': False,
        'error': 'Rate limit exceeded',
        'retry_after': error.retry_after
    }), 429

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT 1')
        cursor.close()
        conn.close()
        db_status = 'healthy'
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = 'unhealthy'
    
    # Check Redis connection
    try:
        if redis_client:
            redis_client.ping()
            redis_status = 'healthy'
        else:
            redis_status = 'unavailable'
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        redis_status = 'unhealthy'
    
    # Check model availability
    try:
        models_loaded = model_manager.get_loaded_models()
        model_status = 'healthy' if models_loaded else 'no_models'
    except Exception as e:
        logger.error(f"Model health check failed: {e}")
        model_status = 'unhealthy'
    
    overall_status = 'healthy' if all(
        status in ['healthy', 'no_models'] 
        for status in [db_status, redis_status, model_status]
    ) else 'unhealthy'
    
    return jsonify({
        'status': overall_status,
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'admetrics-ai-engine',
        'version': '1.0.0',
        'components': {
            'database': db_status,
            'redis': redis_status,
            'models': model_status
        },
        'models_loaded': model_manager.get_loaded_models() if model_status == 'healthy' else []
    })

# Prediction endpoints
@app.route('/api/predict/performance', methods=['POST'])
@limiter.limit("20 per minute")
@require_auth
def predict_performance():
    """Predict campaign performance"""
    try:
        data = request.get_json()
        
        # Validate input
        required_fields = ['campaign_id', 'days', 'metrics']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'required': required_fields
            }), 400
        
        campaign_id = data['campaign_id']
        days = int(data['days'])
        metrics = data['metrics']
        
        if days < 1 or days > 365:
            return jsonify({
                'success': False,
                'error': 'Days must be between 1 and 365'
            }), 400
        
        # Get historical data
        historical_data = get_campaign_historical_data(campaign_id)
        
        if historical_data.empty:
            return jsonify({
                'success': False,
                'error': 'No historical data available for this campaign'
            }), 404
        
        # Make predictions
        predictions = {}
        for metric in metrics:
            try:
                prediction = performance_predictor.predict(
                    historical_data=historical_data,
                    metric=metric,
                    days=days
                )
                predictions[metric] = prediction
            except Exception as e:
                logger.error(f"Prediction failed for metric {metric}: {e}")
                predictions[metric] = {
                    'error': str(e),
                    'values': [],
                    'confidence_intervals': []
                }
        
        # Store prediction results for feedback
        feedback_service.store_prediction(
            campaign_id=campaign_id,
            predictions=predictions,
            request_data=data
        )
        
        return jsonify({
            'success': True,
            'data': {
                'campaign_id': campaign_id,
                'predictions': predictions,
                'forecast_period': days,
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Performance prediction error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/optimize/budget', methods=['POST'])
@limiter.limit("10 per minute")
@require_auth
def optimize_budget():
    """Optimize budget allocation across campaigns"""
    try:
        data = request.get_json()
        
        required_fields = ['campaigns', 'total_budget', 'objective']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'required': required_fields
            }), 400
        
        campaigns = data['campaigns']
        total_budget = float(data['total_budget'])
        objective = data['objective']  # 'maximize_conversions', 'maximize_roas', etc.
        
        if total_budget <= 0:
            return jsonify({
                'success': False,
                'error': 'Total budget must be positive'
            }), 400
        
        # Get campaign performance data
        campaign_data = []
        for campaign_id in campaigns:
            hist_data = get_campaign_historical_data(campaign_id)
            if not hist_data.empty:
                campaign_data.append({
                    'campaign_id': campaign_id,
                    'data': hist_data
                })
        
        if not campaign_data:
            return jsonify({
                'success': False,
                'error': 'No historical data available for provided campaigns'
            }), 404
        
        # Optimize budget allocation
        optimization_result = budget_optimizer.optimize(
            campaign_data=campaign_data,
            total_budget=total_budget,
            objective=objective,
            constraints=data.get('constraints', {})
        )
        
        return jsonify({
            'success': True,
            'data': {
                'optimized_allocation': optimization_result['allocation'],
                'expected_performance': optimization_result['expected_performance'],
                'optimization_score': optimization_result['score'],
                'recommendations': optimization_result['recommendations'],
                'objective': objective,
                'total_budget': total_budget,
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Budget optimization error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze/anomalies', methods=['POST'])
@limiter.limit("15 per minute")
@require_auth
def detect_anomalies():
    """Detect anomalies in campaign performance"""
    try:
        data = request.get_json()
        
        campaign_ids = data.get('campaign_ids', [])
        lookback_days = data.get('lookback_days', 30)
        metrics = data.get('metrics', ['spend', 'clicks', 'conversions', 'ctr'])
        
        anomalies = []
        
        for campaign_id in campaign_ids:
            # Get recent data
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=lookback_days)
            
            campaign_data = get_campaign_data_range(campaign_id, start_date, end_date)
            
            if campaign_data.empty:
                continue
            
            # Detect anomalies for each metric
            for metric in metrics:
                if metric in campaign_data.columns:
                    metric_anomalies = anomaly_detector.detect(
                        data=campaign_data[metric].values,
                        dates=campaign_data['date'].values,
                        metric_name=metric
                    )
                    
                    for anomaly in metric_anomalies:
                        anomalies.append({
                            'campaign_id': campaign_id,
                            'metric': metric,
                            'date': anomaly['date'],
                            'value': anomaly['value'],
                            'expected_value': anomaly['expected_value'],
                            'anomaly_score': anomaly['score'],
                            'severity': anomaly['severity'],
                            'description': anomaly['description']
                        })
        
        return jsonify({
            'success': True,
            'data': {
                'anomalies': anomalies,
                'total_anomalies': len(anomalies),
                'analyzed_campaigns': len(campaign_ids),
                'analysis_period': {
                    'start_date': (datetime.utcnow() - timedelta(days=lookback_days)).isoformat(),
                    'end_date': datetime.utcnow().isoformat(),
                    'days': lookback_days
                },
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/segment/audience', methods=['POST'])
@limiter.limit("10 per minute")
@require_auth
def segment_audience():
    """Segment audience based on performance data"""
    try:
        data = request.get_json()
        
        campaign_ids = data.get('campaign_ids', [])
        segmentation_method = data.get('method', 'performance_based')
        num_segments = data.get('num_segments', 5)
        
        # Get audience data for campaigns
        audience_data = []
        for campaign_id in campaign_ids:
            campaign_audience = get_campaign_audience_data(campaign_id)
            if not campaign_audience.empty:
                audience_data.append({
                    'campaign_id': campaign_id,
                    'data': campaign_audience
                })
        
        if not audience_data:
            return jsonify({
                'success': False,
                'error': 'No audience data available for provided campaigns'
            }), 404
        
        # Perform segmentation
        segments = audience_segmenter.segment(
            audience_data=audience_data,
            method=segmentation_method,
            num_segments=num_segments
        )
        
        return jsonify({
            'success': True,
            'data': {
                'segments': segments,
                'segmentation_method': segmentation_method,
                'num_segments': len(segments),
                'total_audience_size': sum(seg['size'] for seg in segments),
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Audience segmentation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/insights/generate', methods=['POST'])
@limiter.limit("5 per minute")
@require_auth
def generate_insights():
    """Generate AI-powered insights"""
    try:
        data = request.get_json()
        
        campaign_ids = data.get('campaign_ids', [])
        date_range = data.get('date_range', {})
        insight_types = data.get('types', ['performance', 'optimization', 'trends'])
        
        insights = []
        
        for campaign_id in campaign_ids:
            # Get campaign data
            campaign_data = get_campaign_historical_data(campaign_id)
            
            if campaign_data.empty:
                continue
            
            # Generate different types of insights
            for insight_type in insight_types:
                try:
                    if insight_type == 'performance':
                        insight = inference_service.generate_performance_insight(
                            campaign_data, campaign_id
                        )
                    elif insight_type == 'optimization':
                        insight = inference_service.generate_optimization_insight(
                            campaign_data, campaign_id
                        )
                    elif insight_type == 'trends':
                        insight = inference_service.generate_trend_insight(
                            campaign_data, campaign_id
                        )
                    else:
                        continue
                    
                    if insight:
                        insights.append(insight)
                        
                except Exception as e:
                    logger.error(f"Failed to generate {insight_type} insight for campaign {campaign_id}: {e}")
        
        return jsonify({
            'success': True,
            'data': {
                'insights': insights,
                'total_insights': len(insights),
                'analyzed_campaigns': len(campaign_ids),
                'insight_types': insight_types,
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Insight generation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/feedback', methods=['POST'])
@limiter.limit("30 per minute")
@require_auth
def submit_feedback():
    """Submit feedback on AI predictions/recommendations"""
    try:
        data = request.get_json()
        
        required_fields = ['prediction_id', 'feedback_type', 'rating']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'required': required_fields
            }), 400
        
        feedback_id = feedback_service.store_feedback(
            prediction_id=data['prediction_id'],
            feedback_type=data['feedback_type'],
            rating=data['rating'],
            comments=data.get('comments', ''),
            metadata=data.get('metadata', {})
        )
        
        return jsonify({
            'success': True,
            'data': {
                'feedback_id': feedback_id,
                'message': 'Feedback submitted successfully'
            }
        })
        
    except Exception as e:
        logger.error(f"Feedback submission error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/models/retrain', methods=['POST'])
@limiter.limit("2 per hour")
@require_auth
def retrain_models():
    """Trigger model retraining"""
    try:
        data = request.get_json()
        model_types = data.get('model_types', ['performance_predictor'])
        
        results = []
        
        for model_type in model_types:
            try:
                result = training_service.train_model(model_type)
                results.append({
                    'model_type': model_type,
                    'success': True,
                    'metrics': result.get('metrics', {}),
                    'training_time': result.get('training_time', 0)
                })
            except Exception as e:
                logger.error(f"Training failed for {model_type}: {e}")
                results.append({
                    'model_type': model_type,
                    'success': False,
                    'error': str(e)
                })
        
        return jsonify({
            'success': True,
            'data': {
                'training_results': results,
                'completed_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Model retraining error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Helper functions
def get_campaign_historical_data(campaign_id: str) -> pd.DataFrame:
    """Get historical data for a campaign"""
    try:
        conn = get_db_connection()
        query = """
        SELECT 
            date,
            spend,
            clicks,
            impressions,
            conversions,
            conversion_value,
            ctr,
            cpc,
            cpm,
            roas
        FROM campaign_metrics 
        WHERE campaign_id = %s 
        ORDER BY date ASC
        """
        
        df = pd.read_sql_query(query, conn, params=[campaign_id])
        conn.close()
        
        return df
    except Exception as e:
        logger.error(f"Error fetching historical data for campaign {campaign_id}: {e}")
        return pd.DataFrame()

def get_campaign_data_range(campaign_id: str, start_date: datetime, end_date: datetime) -> pd.DataFrame:
    """Get campaign data for a specific date range"""
    try:
        conn = get_db_connection()
        query = """
        SELECT 
            date,
            spend,
            clicks,
            impressions,
            conversions,
            conversion_value,
            ctr,
            cpc,
            cpm,
            roas
        FROM campaign_metrics 
        WHERE campaign_id = %s 
        AND date >= %s 
        AND date <= %s
        ORDER BY date ASC
        """
        
        df = pd.read_sql_query(query, conn, params=[campaign_id, start_date, end_date])
        conn.close()
        
        return df
    except Exception as e:
        logger.error(f"Error fetching campaign data: {e}")
        return pd.DataFrame()

def get_campaign_audience_data(campaign_id: str) -> pd.DataFrame:
    """Get audience data for a campaign"""
    try:
        conn = get_db_connection()
        query = """
        SELECT 
            audience_segment,
            age_range,
            gender,
            location,
            interests,
            performance_metrics
        FROM campaign_audience 
        WHERE campaign_id = %s
        """
        
        df = pd.read_sql_query(query, conn, params=[campaign_id])
        conn.close()
        
        return df
    except Exception as e:
        logger.error(f"Error fetching audience data: {e}")
        return pd.DataFrame()

# Initialize models on startup
@app.before_first_request
def initialize_models():
    """Initialize AI models on startup"""
    try:
        logger.info("Initializing AI models...")
        model_manager.load_default_models()
        logger.info("AI models initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    
    logger.info(f"Starting AdMetrics AI Engine on port {port}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug,
        threaded=True
    )