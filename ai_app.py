#!/usr/bin/env python3
"""
AdMetrics AI Engine - Flask API for Machine Learning Models
This service provides AI-powered insights and optimizations for advertising campaigns.
"""

import os
import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify, g
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from werkzeug.exceptions import HTTPException
import redis
import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import numpy as np
import pandas as pd

# AI/ML imports
from sklearn.ensemble import RandomForestRegressor, IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from prophet import Prophet
import joblib
import mlflow
import mlflow.sklearn

# Internal imports
from src.models.prediction.performance_predictor import PerformancePredictor
from src.models.prediction.budget_optimizer import BudgetOptimizer
from src.models.prediction.anomaly_detector import AnomalyDetector
from src.models.optimization.bid_optimizer import BidOptimizer
from src.models.optimization.audience_segmenter import AudienceSegmenter
from src.models.nlp.sentiment_analyzer import SentimentAnalyzer
from src.services.training_service import TrainingService
from src.services.inference_service import InferenceService
from src.services.feedback_service import FeedbackService
from src.data.preprocessors import DataPreprocessor
from src.utils.model_utils import ModelManager
from src.utils.metrics import calculate_model_metrics
from config import Config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)

# Configure CORS
CORS(app, origins=['http://localhost:3001', 'https://dashboard.admetrics.ai'])

# Configure JWT
jwt = JWTManager(app)

# Database connection
engine = create_engine(app.config['DATABASE_URL'])
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Redis connection
redis_client = redis.Redis.from_url(app.config['REDIS_URL'])

# MLflow setup
mlflow.set_tracking_uri(app.config.get('MLFLOW_TRACKING_URI', 'sqlite:///mlflow.db'))
mlflow.set_experiment('admetrics-ai-models')

# Initialize AI services
model_manager = ModelManager(app.config['MODEL_PATH'])
data_preprocessor = DataPreprocessor()
training_service = TrainingService(model_manager, engine)
inference_service = InferenceService(model_manager, redis_client)
feedback_service = FeedbackService(engine, redis_client)

# Initialize AI models
performance_predictor = PerformancePredictor()
budget_optimizer = BudgetOptimizer()
anomaly_detector = AnomalyDetector()
bid_optimizer = BidOptimizer()
audience_segmenter = AudienceSegmenter()
sentiment_analyzer = SentimentAnalyzer()

# Global error handler
@app.errorhandler(Exception)
def handle_exception(e):
    """Global exception handler"""
    if isinstance(e, HTTPException):
        return jsonify({
            'success': False,
            'error': e.description,
            'code': e.code
        }), e.code
    
    logger.error(f"Unhandled exception: {str(e)}\n{traceback.format_exc()}")
    return jsonify({
        'success': False,
        'error': 'Internal server error',
        'message': str(e) if app.debug else 'An unexpected error occurred'
    }), 500

# Database session management
@app.before_request
def create_db_session():
    """Create database session for each request"""
    g.db = SessionLocal()

@app.teardown_request
def close_db_session(exception):
    """Close database session after each request"""
    if hasattr(g, 'db'):
        g.db.close()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        
        # Check Redis connection
        redis_client.ping()
        
        # Check model availability
        available_models = model_manager.list_available_models()
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'services': {
                'database': 'connected',
                'redis': 'connected',
                'models': len(available_models)
            },
            'available_models': available_models
        })
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e)
        }), 503

# Prediction endpoints
@app.route('/api/v1/predictions/performance', methods=['POST'])
@jwt_required()
def predict_performance():
    """Predict campaign performance metrics"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input data
        required_fields = ['campaign_id', 'historical_data', 'prediction_days']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Process input data
        historical_data = pd.DataFrame(data['historical_data'])
        processed_data = data_preprocessor.prepare_time_series_data(historical_data)
        
        # Generate predictions
        predictions = performance_predictor.predict(
            data=processed_data,
            campaign_id=data['campaign_id'],
            prediction_days=data['prediction_days']
        )
        
        # Calculate confidence intervals
        confidence = performance_predictor.calculate_confidence_intervals(predictions)
        
        # Store predictions in cache
        cache_key = f"predictions:performance:{user_id}:{data['campaign_id']}"
        redis_client.setex(
            cache_key, 
            3600,  # 1 hour cache
            jsonify(predictions).data
        )
        
        return jsonify({
            'success': True,
            'predictions': predictions,
            'confidence_intervals': confidence,
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Performance prediction error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to generate performance predictions'
        }), 500

@app.route('/api/v1/optimization/budget', methods=['POST'])
@jwt_required()
def optimize_budget():
    """Optimize budget allocation across campaigns"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        required_fields = ['campaigns', 'total_budget', 'optimization_goal']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Prepare campaign data
        campaigns_df = pd.DataFrame(data['campaigns'])
        processed_campaigns = data_preprocessor.prepare_optimization_data(campaigns_df)
        
        # Perform budget optimization
        optimization_result = budget_optimizer.optimize(
            campaigns=processed_campaigns,
            total_budget=data['total_budget'],
            goal=data['optimization_goal'],
            constraints=data.get('constraints', {})
        )
        
        # Calculate expected impact
        impact_analysis = budget_optimizer.calculate_impact(
            current_allocation=campaigns_df['current_budget'].tolist(),
            optimized_allocation=optimization_result['allocations']
        )
        
        return jsonify({
            'success': True,
            'optimized_allocation': optimization_result,
            'impact_analysis': impact_analysis,
            'optimization_score': optimization_result.get('score', 0),
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Budget optimization error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to optimize budget allocation'
        }), 500

@app.route('/api/v1/anomalies/detect', methods=['POST'])
@jwt_required()
def detect_anomalies():
    """Detect anomalies in campaign performance"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        if 'metrics_data' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing metrics_data field'
            }), 400
        
        # Process metrics data
        metrics_df = pd.DataFrame(data['metrics_data'])
        processed_metrics = data_preprocessor.prepare_anomaly_detection_data(metrics_df)
        
        # Detect anomalies
        anomalies = anomaly_detector.detect(
            data=processed_metrics,
            sensitivity=data.get('sensitivity', 0.1),
            method=data.get('method', 'isolation_forest')
        )
        
        # Generate explanations for anomalies
        explanations = anomaly_detector.explain_anomalies(
            data=processed_metrics,
            anomalies=anomalies
        )
        
        return jsonify({
            'success': True,
            'anomalies': anomalies,
            'explanations': explanations,
            'total_anomalies': len(anomalies),
            'detection_method': data.get('method', 'isolation_forest'),
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to detect anomalies'
        }), 500

@app.route('/api/v1/optimization/bids', methods=['POST'])
@jwt_required()
def optimize_bids():
    """Optimize bid strategies for campaigns"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        required_fields = ['campaign_data', 'platform', 'objective']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Process campaign data
        campaign_df = pd.DataFrame(data['campaign_data'])
        processed_data = data_preprocessor.prepare_bid_optimization_data(campaign_df)
        
        # Optimize bids
        bid_recommendations = bid_optimizer.optimize(
            data=processed_data,
            platform=data['platform'],
            objective=data['objective'],
            constraints=data.get('constraints', {})
        )
        
        # Calculate expected performance improvement
        performance_impact = bid_optimizer.estimate_performance_impact(
            current_bids=campaign_df['current_bid'].tolist(),
            recommended_bids=bid_recommendations['bids']
        )
        
        return jsonify({
            'success': True,
            'bid_recommendations': bid_recommendations,
            'performance_impact': performance_impact,
            'optimization_strategy': bid_recommendations.get('strategy'),
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Bid optimization error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to optimize bids'
        }), 500

@app.route('/api/v1/segmentation/audience', methods=['POST'])
@jwt_required()
def segment_audience():
    """Perform intelligent audience segmentation"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        if 'audience_data' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing audience_data field'
            }), 400
        
        # Process audience data
        audience_df = pd.DataFrame(data['audience_data'])
        processed_data = data_preprocessor.prepare_segmentation_data(audience_df)
        
        # Perform segmentation
        segments = audience_segmenter.segment(
            data=processed_data,
            n_segments=data.get('n_segments', 5),
            method=data.get('method', 'kmeans')
        )
        
        # Generate segment profiles
        segment_profiles = audience_segmenter.generate_profiles(
            data=processed_data,
            segments=segments
        )
        
        # Calculate segment performance insights
        insights = audience_segmenter.analyze_segment_performance(
            segments=segments,
            performance_data=data.get('performance_data', {})
        )
        
        return jsonify({
            'success': True,
            'segments': segments,
            'segment_profiles': segment_profiles,
            'insights': insights,
            'segmentation_method': data.get('method', 'kmeans'),
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Audience segmentation error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to perform audience segmentation'
        }), 500

@app.route('/api/v1/sentiment/analyze', methods=['POST'])
@jwt_required()
def analyze_sentiment():
    """Analyze sentiment of ad comments and interactions"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        if 'text_data' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing text_data field'
            }), 400
        
        # Analyze sentiment
        sentiment_results = sentiment_analyzer.analyze_bulk(
            texts=data['text_data'],
            language=data.get('language', 'en')
        )
        
        # Generate sentiment summary
        summary = sentiment_analyzer.generate_summary(sentiment_results)
        
        # Extract insights and trends
        insights = sentiment_analyzer.extract_insights(
            sentiment_results,
            campaign_data=data.get('campaign_data', {})
        )
        
        return jsonify({
            'success': True,
            'sentiment_results': sentiment_results,
            'summary': summary,
            'insights': insights,
            'total_analyzed': len(data['text_data']),
            'generated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Sentiment analysis error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to analyze sentiment'
        }), 500

# Model training endpoints
@app.route('/api/v1/models/train', methods=['POST'])
@jwt_required()
def train_model():
    """Train or retrain AI models with new data"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Validate input
        required_fields = ['model_type', 'training_data']
        if not all(field in data for field in required_fields):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400
        
        # Start model training
        training_job = training_service.start_training(
            model_type=data['model_type'],
            training_data=data['training_data'],
            user_id=user_id,
            config=data.get('config', {})
        )
        
        return jsonify({
            'success': True,
            'training_job_id': training_job['job_id'],
            'estimated_duration': training_job['estimated_duration'],
            'status': 'started'
        })
        
    except Exception as e:
        logger.error(f"Model training error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to start model training'
        }), 500

@app.route('/api/v1/models/status/<job_id>', methods=['GET'])
@jwt_required()
def get_training_status(job_id):
    """Get training job status"""
    try:
        status = training_service.get_training_status(job_id)
        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        logger.error(f"Training status error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get training status'
        }), 500

# Feedback endpoint for continuous learning
@app.route('/api/v1/feedback', methods=['POST'])
@jwt_required()
def submit_feedback():
    """Submit feedback on AI recommendations"""
    try:
        data = request.get_json()
        user_id = get_jwt_identity()
        
        # Process feedback
        feedback_service.process_feedback(
            user_id=user_id,
            feedback_data=data
        )
        
        return jsonify({
            'success': True,
            'message': 'Feedback received and processed'
        })
        
    except Exception as e:
        logger.error(f"Feedback processing error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to process feedback'
        }), 500

# Model information endpoints
@app.route('/api/v1/models/info', methods=['GET'])
@jwt_required()
def get_models_info():
    """Get information about available models"""
    try:
        models_info = model_manager.get_models_info()
        return jsonify({
            'success': True,
            'models': models_info
        })
    except Exception as e:
        logger.error(f"Models info error: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get models information'
        }), 500

if __name__ == '__main__':
    # Load models on startup
    try:
        logger.info("Loading AI models...")
        model_manager.load_all_models()
        logger.info("AI models loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load models: {str(e)}")
    
    # Start Flask application
    app.run(
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000)),
        debug=os.environ.get('FLASK_ENV') == 'development'
    )