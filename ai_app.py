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
            password=os.getenv('DB_PASSWORD', 'postgres123'),
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

# Load trained models
performance_predictor = PerformancePredictor()
budget_optimizer = BudgetOptimizer()
audience_segmenter = AudienceSegmenter()
anomaly_detector = AnomalyDetector()

# Initialize services
training_service = TrainingService(model_manager)
inference_service = InferenceService(model_manager, redis_client)

# Middleware
@app.before_request
def before_request():
    """Set up request context"""
    g.start_time = datetime.utcnow()
    g.user_id = request.headers.get('X-User-ID')
    
    # Log request
    logger.info(f"Request: {request.method} {request.path} - User: {g.user_id}")

@app.after_request
def after_request(response):
    """Log response and metrics"""
    duration = (datetime.utcnow() - g.start_time).total_seconds()
    logger.info(f"Response: {response.status_code} - Duration: {duration:.3f}s")
    
    # Add CORS headers
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-User-ID')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {e}", exc_info=True)
    return jsonify({
        'success': False,
        'error': 'INTERNAL_ERROR',
        'message': 'An internal error occurred'
    }), 500

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        conn = get_db_connection()
        conn.close()
        db_status = 'connected'
    except:
        db_status = 'disconnected'
    
    # Check Redis connection
    try:
        redis_client.ping()
        redis_status = 'connected'
    except:
        redis_status = 'disconnected'
    
    # Check model availability
    models_status = {
        'performance_predictor': performance_predictor.is_loaded(),
        'budget_optimizer': budget_optimizer.is_loaded(),
        'audience_segmenter': audience_segmenter.is_loaded(),
        'anomaly_detector': anomaly_detector.is_loaded(),
    }
    
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'services': {
            'database': db_status,
            'redis': redis_status,
            'models': models_status
        }
    })

# Prediction endpoints
@app.route('/api/predict/performance', methods=['POST'])
@limiter.limit("10 per minute")
def predict_performance():
    """Predict campaign performance"""
    try:
        data = request.get_json()
        
        # Validate input data
        if not data_validator.validate_prediction_input(data):
            return jsonify({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'Invalid input data'
            }), 400
        
        # Extract parameters
        campaign_id = data.get('campaign_id')
        historical_data = data.get('historical_data', [])
        prediction_days = data.get('prediction_days', 30)
        metrics = data.get('metrics', ['spend', 'clicks', 'conversions'])
        
        # Get historical data from database if not provided
        if not historical_data and campaign_id:
            historical_data = get_campaign_historical_data(campaign_id)
        
        # Make predictions
        predictions = performance_predictor.predict(
            historical_data=historical_data,
            prediction_days=prediction_days,
            metrics=metrics
        )
        
        # Calculate confidence intervals
        confidence_intervals = performance_predictor.calculate_confidence_intervals(
            predictions, confidence_level=0.95
        )
        
        # Store predictions in cache
        cache_key = f"predictions:{campaign_id}:{prediction_days}"
        redis_client.setex(
            cache_key, 
            3600,  # 1 hour cache
            str(predictions)
        )
        
        return jsonify({
            'success': True,
            'data': {
                'predictions': predictions,
                'confidence_intervals': confidence_intervals,
                'prediction_days': prediction_days,
                'metrics': metrics,
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Performance prediction error: {e}")
        return jsonify({
            'success': False,
            'error': 'PREDICTION_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/optimize/budget', methods=['POST'])
@limiter.limit("5 per minute")
def optimize_budget():
    """Optimize budget allocation across campaigns"""
    try:
        data = request.get_json()
        
        # Validate input
        if not data_validator.validate_optimization_input(data):
            return jsonify({
                'success': False,
                'error': 'VALIDATION_ERROR',
                'message': 'Invalid optimization data'
            }), 400
        
        campaigns = data.get('campaigns', [])
        total_budget = data.get('total_budget')
        objective = data.get('objective', 'maximize_conversions')
        constraints = data.get('constraints', {})
        
        # Perform budget optimization
        optimization_result = budget_optimizer.optimize(
            campaigns=campaigns,
            total_budget=total_budget,
            objective=objective,
            constraints=constraints
        )
        
        # Calculate expected impact
        expected_impact = budget_optimizer.calculate_expected_impact(
            optimization_result
        )
        
        return jsonify({
            'success': True,
            'data': {
                'optimization': optimization_result,
                'expected_impact': expected_impact,
                'objective': objective,
                'total_budget': total_budget,
                'optimized_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Budget optimization error: {e}")
        return jsonify({
            'success': False,
            'error': 'OPTIMIZATION_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/analyze/anomalies', methods=['POST'])
@limiter.limit("20 per minute")
def detect_anomalies():
    """Detect anomalies in campaign metrics"""
    try:
        data = request.get_json()
        
        campaign_ids = data.get('campaign_ids', [])
        metrics = data.get('metrics', ['spend', 'clicks', 'conversions'])
        sensitivity = data.get('sensitivity', 'medium')
        
        anomalies = []
        
        for campaign_id in campaign_ids:
            # Get recent metrics data
            metrics_data = get_campaign_metrics(campaign_id, days=30)
            
            # Detect anomalies
            campaign_anomalies = anomaly_detector.detect(
                data=metrics_data,
                metrics=metrics,
                sensitivity=sensitivity
            )
            
            # Add campaign context
            for anomaly in campaign_anomalies:
                anomaly['campaign_id'] = campaign_id
                anomalies.append(anomaly)
        
        # Rank anomalies by severity
        ranked_anomalies = sorted(
            anomalies, 
            key=lambda x: x.get('severity_score', 0), 
            reverse=True
        )
        
        return jsonify({
            'success': True,
            'data': {
                'anomalies': ranked_anomalies[:50],  # Limit to top 50
                'total_found': len(anomalies),
                'sensitivity': sensitivity,
                'analyzed_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return jsonify({
            'success': False,
            'error': 'ANOMALY_DETECTION_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/segment/audience', methods=['POST'])
@limiter.limit("5 per minute")
def segment_audience():
    """Segment audience for better targeting"""
    try:
        data = request.get_json()
        
        campaign_id = data.get('campaign_id')
        segmentation_method = data.get('method', 'behavioral')
        num_segments = data.get('num_segments', 5)
        
        # Get audience data
        audience_data = get_audience_data(campaign_id)
        
        if not audience_data:
            return jsonify({
                'success': False,
                'error': 'NO_DATA',
                'message': 'No audience data available for segmentation'
            }), 400
        
        # Perform segmentation
        segments = audience_segmenter.segment(
            data=audience_data,
            method=segmentation_method,
            num_segments=num_segments
        )
        
        # Calculate segment characteristics
        segment_analysis = audience_segmenter.analyze_segments(segments)
        
        return jsonify({
            'success': True,
            'data': {
                'segments': segments,
                'analysis': segment_analysis,
                'method': segmentation_method,
                'campaign_id': campaign_id,
                'segmented_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Audience segmentation error: {e}")
        return jsonify({
            'success': False,
            'error': 'SEGMENTATION_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/insights/generate', methods=['POST'])
@limiter.limit("10 per minute")
def generate_insights():
    """Generate AI insights for campaigns"""
    try:
        data = request.get_json()
        
        campaign_ids = data.get('campaign_ids', [])
        insight_types = data.get('types', ['performance', 'optimization', 'anomalies'])
        
        insights = []
        
        for campaign_id in campaign_ids:
            campaign_insights = inference_service.generate_insights(
                campaign_id=campaign_id,
                insight_types=insight_types
            )
            insights.extend(campaign_insights)
        
        # Rank insights by importance
        ranked_insights = sorted(
            insights,
            key=lambda x: x.get('importance_score', 0),
            reverse=True
        )
        
        return jsonify({
            'success': True,
            'data': {
                'insights': ranked_insights,
                'total_generated': len(insights),
                'insight_types': insight_types,
                'generated_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Insight generation error: {e}")
        return jsonify({
            'success': False,
            'error': 'INSIGHT_GENERATION_ERROR',
            'message': str(e)
        }), 500

# Model management endpoints
@app.route('/api/models/train', methods=['POST'])
@limiter.limit("1 per hour")
def train_models():
    """Trigger model training"""
    try:
        data = request.get_json()
        
        model_types = data.get('model_types', ['performance_predictor'])
        training_data_days = data.get('training_data_days', 90)
        
        # Start training process
        training_job = training_service.start_training(
            model_types=model_types,
            training_data_days=training_data_days
        )
        
        return jsonify({
            'success': True,
            'data': {
                'job_id': training_job['id'],
                'status': 'started',
                'model_types': model_types,
                'started_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"Model training error: {e}")
        return jsonify({
            'success': False,
            'error': 'TRAINING_ERROR',
            'message': str(e)
        }), 500

@app.route('/api/models/status', methods=['GET'])
def get_model_status():
    """Get status of all models"""
    try:
        status = {
            'performance_predictor': {
                'loaded': performance_predictor.is_loaded(),
                'version': performance_predictor.get_version(),
                'last_trained': performance_predictor.get_last_trained_date(),
                'accuracy': performance_predictor.get_accuracy_metrics()
            },
            'budget_optimizer': {
                'loaded': budget_optimizer.is_loaded(),
                'version': budget_optimizer.get_version(),
                'last_trained': budget_optimizer.get_last_trained_date()
            },
            'audience_segmenter': {
                'loaded': audience_segmenter.is_loaded(),
                'version': audience_segmenter.get_version(),
                'last_trained': audience_segmenter.get_last_trained_date()
            },
            'anomaly_detector': {
                'loaded': anomaly_detector.is_loaded(),
                'version': anomaly_detector.get_version(),
                'last_trained': anomaly_detector.get_last_trained_date()
            }
        }
        
        return jsonify({
            'success': True,
            'data': status
        })
        
    except Exception as e:
        logger.error(f"Model status error: {e}")
        return jsonify({
            'success': False,
            'error': 'STATUS_ERROR',
            'message': str(e)
        }), 500

# Helper functions
def get_campaign_historical_data(campaign_id: str, days: int = 90) -> List[Dict]:
    """Get historical data for a campaign"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT date, spend, clicks, impressions, conversions, ctr, cpc, roas
        FROM metrics 
        WHERE campaign_id = %s 
        AND date >= %s 
        ORDER BY date ASC
        """
        
        start_date = datetime.utcnow() - timedelta(days=days)
        cursor.execute(query, (campaign_id, start_date))
        
        results = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"Error fetching historical data: {e}")
        return []

def get_campaign_metrics(campaign_id: str, days: int = 30) -> List[Dict]:
    """Get recent metrics for a campaign"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT * FROM metrics 
        WHERE campaign_id = %s 
        AND date >= %s 
        ORDER BY date DESC
        """
        
        start_date = datetime.utcnow() - timedelta(days=days)
        cursor.execute(query, (campaign_id, start_date))
        
        results = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in results]
        
    except Exception as e:
        logger.error(f"Error fetching campaign metrics: {e}")
        return []

def get_audience_data(campaign_id: str) -> Optional[Dict]:
    """Get audience data for segmentation"""
    try:
        # This would typically fetch from your audience data store
        # For now, return mock data structure
        return {
            'demographics': {},
            'behavioral_data': {},
            'interaction_history': [],
            'conversion_data': []
        }
    except Exception as e:
        logger.error(f"Error fetching audience data: {e}")
        return None

if __name__ == '__main__':
    # Load models on startup
    try:
        logger.info("Loading AI models...")
        performance_predictor.load_model()
        budget_optimizer.load_model()
        audience_segmenter.load_model()
        anomaly_detector.load_model()
        logger.info("All models loaded successfully")
    except Exception as e:
        logger.warning(f"Some models failed to load: {e}")
    
    # Start Flask app
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting AdMetrics AI Engine on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)