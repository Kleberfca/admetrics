#!/usr/bin/env python3
"""
AdMetrics AI Engine
Flask API for AI-powered advertising analytics and optimization
"""

import os
import sys
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import redis
import psycopg2
from psycopg2.extras import RealDictCursor
import pandas as pd
import numpy as np

# Add project root to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.models.prediction.performance_predictor import PerformancePredictor
from src.models.optimization.budget_optimizer import BudgetOptimizer
from src.models.optimization.audience_segmenter import AudienceSegmenter
from src.models.prediction.anomaly_detector import AnomalyDetector
from src.services.training_service import TrainingService
from src.services.inference_service import InferenceService
from src.utils.model_utils import ModelManager
from src.utils.data_validator import DataValidator
from src.utils.metrics_calculator import MetricsCalculator

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config.from_object('src.config.Config')

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
    default_limits=["200 per day", "50 per hour"]
)

# Initialize Redis for caching
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=int(os.getenv('REDIS_DB', 1)),
    decode_responses=True
)

# Initialize database connection
def get_db_connection():
    """Get PostgreSQL database connection"""
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=int(os.getenv('DB_PORT', 5432)),
            database=os.getenv('DB_NAME', 'admetrics'),
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', ''),
            cursor_factory=RealDictCursor
        )
        return conn
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        return None

# Initialize services
model_manager = ModelManager()
training_service = TrainingService()
inference_service = InferenceService()
data_validator = DataValidator()
metrics_calculator = MetricsCalculator()

# Initialize AI models
performance_predictor = PerformancePredictor()
budget_optimizer = BudgetOptimizer()
audience_segmenter = AudienceSegmenter()
anomaly_detector = AnomalyDetector()

@app.before_request
def before_request():
    """Set up request context"""
    g.start_time = datetime.now()
    g.request_id = request.headers.get('X-Request-ID', str(datetime.now().timestamp()))

@app.after_request
def after_request(response):
    """Log request duration"""
    if hasattr(g, 'start_time'):
        duration = (datetime.now() - g.start_time).total_seconds()
        logger.info(f"Request {g.request_id} completed in {duration:.3f}s")
    response.headers['X-Request-ID'] = g.request_id
    return response

@app.errorhandler(Exception)
def handle_error(error):
    """Global error handler"""
    logger.error(f"Unhandled error: {error}", exc_info=True)
    return jsonify({
        'success': False,
        'error': str(error),
        'message': 'An unexpected error occurred'
    }), 500

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        conn = get_db_connection()
        db_healthy = conn is not None
        if conn:
            conn.close()
        
        # Check Redis connection
        redis_healthy = redis_client.ping()
        
        # Check model status
        models_loaded = all([
            performance_predictor.is_loaded(),
            budget_optimizer.is_loaded(),
            audience_segmenter.is_loaded(),
            anomaly_detector.is_loaded()
        ])
        
        return jsonify({
            'status': 'healthy' if db_healthy and redis_healthy and models_loaded else 'unhealthy',
            'timestamp': datetime.now().isoformat(),
            'services': {
                'database': 'connected' if db_healthy else 'disconnected',
                'redis': 'connected' if redis_healthy else 'disconnected',
                'models': 'loaded' if models_loaded else 'not loaded'
            }
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 503

# Prediction endpoints
@app.route('/api/predict/performance', methods=['POST'])
@limiter.limit("10 per hour")
def predict_performance():
    """Predict campaign performance"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data_validator.validate_prediction_input(data):
            return jsonify({
                'success': False,
                'error': 'Invalid input data'
            }), 400
        
        # Get historical data
        campaign_id = data['campaign_id']
        prediction_days = data.get('prediction_days', 30)
        
        # Fetch from database
        conn = get_db_connection()
        if not conn:
            raise Exception("Database connection failed")
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, impressions, clicks, spend, conversions
            FROM metrics
            WHERE campaign_id = %s
            ORDER BY date DESC
            LIMIT 90
        """, (campaign_id,))
        
        historical_data = pd.DataFrame(cursor.fetchall())
        cursor.close()
        conn.close()
        
        if historical_data.empty:
            return jsonify({
                'success': False,
                'error': 'No historical data found'
            }), 404
        
        # Make predictions
        predictions = performance_predictor.predict(
            historical_data,
            prediction_days=prediction_days
        )
        
        # Cache results
        cache_key = f"predictions:{campaign_id}:{prediction_days}"
        redis_client.setex(cache_key, 3600, predictions.to_json())
        
        return jsonify({
            'success': True,
            'data': predictions.to_dict(orient='records')
        })
        
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/optimize/budget', methods=['POST'])
@limiter.limit("5 per hour")
def optimize_budget():
    """Optimize budget allocation across campaigns"""
    try:
        data = request.get_json()
        
        # Validate input
        total_budget = data.get('total_budget')
        campaign_ids = data.get('campaign_ids', [])
        optimization_goal = data.get('optimization_goal', 'conversions')
        
        if not total_budget or not campaign_ids:
            return jsonify({
                'success': False,
                'error': 'Missing required parameters'
            }), 400
        
        # Fetch campaign data
        conn = get_db_connection()
        if not conn:
            raise Exception("Database connection failed")
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT campaign_id, AVG(cpc) as avg_cpc, AVG(conversions/clicks) as conv_rate,
                   AVG(spend) as avg_spend, SUM(conversions) as total_conversions
            FROM metrics
            WHERE campaign_id = ANY(%s)
            AND date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY campaign_id
        """, (campaign_ids,))
        
        campaign_data = pd.DataFrame(cursor.fetchall())
        cursor.close()
        conn.close()
        
        # Optimize budget allocation
        optimization_result = budget_optimizer.optimize(
            campaign_data,
            total_budget,
            optimization_goal
        )
        
        return jsonify({
            'success': True,
            'data': optimization_result
        })
        
    except Exception as e:
        logger.error(f"Optimization error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/segment/audience', methods=['POST'])
@limiter.limit("10 per hour")
def segment_audience():
    """Segment audience based on behavior patterns"""
    try:
        data = request.get_json()
        campaign_id = data.get('campaign_id')
        
        if not campaign_id:
            return jsonify({
                'success': False,
                'error': 'Campaign ID required'
            }), 400
        
        # Fetch audience data
        conn = get_db_connection()
        if not conn:
            raise Exception("Database connection failed")
        
        # This is a simplified example - real implementation would fetch more detailed data
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT user_attributes
            FROM campaign_interactions
            WHERE campaign_id = %s
            LIMIT 10000
        """, (campaign_id,))
        
        audience_data = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Perform segmentation
        segments = audience_segmenter.segment(audience_data)
        
        return jsonify({
            'success': True,
            'data': segments
        })
        
    except Exception as e:
        logger.error(f"Segmentation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/detect/anomalies', methods=['POST'])
@limiter.limit("20 per hour")
def detect_anomalies():
    """Detect anomalies in campaign metrics"""
    try:
        data = request.get_json()
        campaign_ids = data.get('campaign_ids', [])
        metric_type = data.get('metric_type', 'all')
        
        # Fetch recent metrics
        conn = get_db_connection()
        if not conn:
            raise Exception("Database connection failed")
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT campaign_id, date, impressions, clicks, spend, conversions
            FROM metrics
            WHERE campaign_id = ANY(%s)
            AND date >= CURRENT_DATE - INTERVAL '7 days'
            ORDER BY campaign_id, date
        """, (campaign_ids,))
        
        metrics_data = pd.DataFrame(cursor.fetchall())
        cursor.close()
        conn.close()
        
        # Detect anomalies
        anomalies = anomaly_detector.detect(metrics_data, metric_type)
        
        # Create alerts for critical anomalies
        if anomalies['critical']:
            # Store alerts in database
            conn = get_db_connection()
            cursor = conn.cursor()
            
            for anomaly in anomalies['critical']:
                cursor.execute("""
                    INSERT INTO ai_insights (campaign_id, type, category, title, description, severity, confidence, data)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    anomaly['campaign_id'],
                    'anomaly',
                    'performance',
                    f"Anomaly detected in {anomaly['metric']}",
                    anomaly['description'],
                    'critical',
                    anomaly['confidence'],
                    jsonify(anomaly)
                ))
            
            conn.commit()
            cursor.close()
            conn.close()
        
        return jsonify({
            'success': True,
            'data': anomalies
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/train/model', methods=['POST'])
@limiter.limit("1 per day")
def train_model():
    """Trigger model retraining"""
    try:
        data = request.get_json()
        model_type = data.get('model_type')
        
        if model_type not in ['performance', 'budget', 'audience', 'anomaly']:
            return jsonify({
                'success': False,
                'error': 'Invalid model type'
            }), 400
        
        # Start training job (async)
        job_id = training_service.start_training(model_type)
        
        return jsonify({
            'success': True,
            'data': {
                'job_id': job_id,
                'status': 'started',
                'message': 'Training job initiated'
            }
        })
        
    except Exception as e:
        logger.error(f"Training error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/insights/generate', methods=['POST'])
@limiter.limit("10 per hour")
def generate_insights():
    """Generate AI insights for campaigns"""
    try:
        data = request.get_json()
        campaign_ids = data.get('campaign_ids', [])
        insight_types = data.get('insight_types', ['performance', 'optimization', 'audience'])
        
        insights = []
        
        # Generate different types of insights
        for campaign_id in campaign_ids:
            # Performance insights
            if 'performance' in insight_types:
                perf_insights = inference_service.generate_performance_insights(campaign_id)
                insights.extend(perf_insights)
            
            # Optimization insights
            if 'optimization' in insight_types:
                opt_insights = inference_service.generate_optimization_insights(campaign_id)
                insights.extend(opt_insights)
            
            # Audience insights
            if 'audience' in insight_types:
                aud_insights = inference_service.generate_audience_insights(campaign_id)
                insights.extend(aud_insights)
        
        return jsonify({
            'success': True,
            'data': insights
        })
        
    except Exception as e:
        logger.error(f"Insight generation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    # Load models on startup
    logger.info("Loading AI models...")
    model_manager.load_all_models()
    
    # Start Flask app
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )