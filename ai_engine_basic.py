# ai-engine/requirements.txt
Flask==2.3.3
Flask-CORS==4.0.0
Flask-JWT-Extended==4.5.3
SQLAlchemy==2.0.21
psycopg2-binary==2.9.7
redis==5.0.0
numpy==1.24.3
pandas==2.0.3
scikit-learn==1.3.0
lightgbm==4.0.0
xgboost==1.7.6
prophet==1.1.4
tensorflow==2.13.0
torch==2.0.1
transformers==4.33.2
requests==2.31.0
python-dotenv==1.0.0
schedule==1.2.0
joblib==1.3.2
matplotlib==3.7.2
seaborn==0.12.2
plotly==5.15.0
gunicorn==21.2.0

# Development dependencies
pytest==7.4.2
pytest-cov==4.1.0
black==23.7.0
flake8==6.0.0
isort==5.12.0

---

# ai-engine/src/api/app.py
import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import redis
import numpy as np
import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import services
from ..services.prediction_service import PredictionService
from ..services.optimization_service import OptimizationService
from ..services.anomaly_service import AnomalyService
from ..services.model_manager import ModelManager
from ..services.training_service import TrainingService
from ..services.feedback_service import FeedbackService
from ..utils.logger import setup_logger

# Setup logging
logger = setup_logger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'your-jwt-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)

# Extensions
cors = CORS(app)
jwt = JWTManager(app)

# Initialize Redis
try:
    redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))
    redis_client.ping()
    logger.info("Redis connection established")
except Exception as e:
    logger.error(f"Redis connection failed: {e}")
    redis_client = None

# Initialize services
model_manager = ModelManager()
prediction_service = PredictionService(model_manager)
optimization_service = OptimizationService(model_manager)
anomaly_service = AnomalyService(model_manager)
training_service = TrainingService(model_manager)
feedback_service = FeedbackService()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'admetrics-ai-engine',
        'version': '1.0.0'
    }), 200

# Model information endpoint
@app.route('/api/v1/models', methods=['GET'])
@jwt_required()
def get_models():
    """Get available models information"""
    try:
        models = model_manager.get_available_models()
        return jsonify({
            'success': True,
            'data': models
        }), 200
    except Exception as e:
        logger.error(f"Get models error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Prediction endpoints
@app.route('/api/v1/predict/performance', methods=['POST'])
@jwt_required()
def predict_performance():
    """Predict campaign performance"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['campaign_id', 'days', 'metrics']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Get prediction
        prediction = prediction_service.predict_campaign_performance(
            campaign_id=data['campaign_id'],
            days=data['days'],
            metrics=data['metrics'],
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': prediction
        }), 200
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Performance prediction error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/v1/predict/budget', methods=['POST'])
@jwt_required()
def predict_budget_impact():
    """Predict budget allocation impact"""
    try:
        data = request.get_json()
        
        required_fields = ['campaign_ids', 'budget_scenarios']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Get budget impact prediction
        prediction = prediction_service.predict_budget_impact(
            campaign_ids=data['campaign_ids'],
            budget_scenarios=data['budget_scenarios'],
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': prediction
        }), 200
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Budget prediction error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

# Optimization endpoints
@app.route('/api/v1/optimize/budget', methods=['POST'])
@jwt_required()
def optimize_budget():
    """Optimize budget allocation"""
    try:
        data = request.get_json()
        
        required_fields = ['campaign_ids', 'total_budget', 'objective']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Get optimization
        optimization = optimization_service.optimize_budget_allocation(
            campaign_ids=data['campaign_ids'],
            total_budget=data['total_budget'],
            objective=data['objective'],
            constraints=data.get('constraints', {}),
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': optimization
        }), 200
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Budget optimization error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/v1/optimize/bidding', methods=['POST'])
@jwt_required()
def optimize_bidding():
    """Optimize bidding strategy"""
    try:
        data = request.get_json()
        
        required_fields = ['campaign_id', 'bid_strategy', 'target_metric']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Get bidding optimization
        optimization = optimization_service.optimize_bidding_strategy(
            campaign_id=data['campaign_id'],
            bid_strategy=data['bid_strategy'],
            target_metric=data['target_metric'],
            constraints=data.get('constraints', {}),
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': optimization
        }), 200
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Bidding optimization error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

# Anomaly detection endpoints
@app.route('/api/v1/anomaly/detect', methods=['POST'])
@jwt_required()
def detect_anomalies():
    """Detect anomalies in campaign data"""
    try:
        data = request.get_json()
        
        required_fields = ['campaign_id', 'metrics_data']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Detect anomalies
        anomalies = anomaly_service.detect_campaign_anomalies(
            campaign_id=data['campaign_id'],
            metrics_data=data['metrics_data'],
            sensitivity=data.get('sensitivity', 0.5),
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': anomalies
        }), 200
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

# Training endpoints
@app.route('/api/v1/train/model', methods=['POST'])
@jwt_required()
def train_model():
    """Train a new model"""
    try:
        data = request.get_json()
        
        required_fields = ['model_type', 'training_data']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        user_id = get_jwt_identity()
        
        # Start training
        training_job = training_service.start_training(
            model_type=data['model_type'],
            training_data=data['training_data'],
            hyperparameters=data.get('hyperparameters', {}),
            user_id=user_id
        )
        
        return jsonify({
            'success': True,
            'data': training_job
        }), 202
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Model training error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

@app.route('/api/v1/train/status/<job_id>', methods=['GET'])
@jwt_required()
def get_training_status(job_id):
    """Get training job status"""
    try:
        status = training_service.get_training_status(job_id)
        return jsonify({
            'success': True,
            'data': status
        }), 200
    except Exception as e:
        logger.error(f"Training status error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

# Feedback endpoint
@app.route('/api/v1/feedback', methods=['POST'])
@jwt_required()
def submit_feedback():
    """Submit feedback for model improvement"""
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
        }), 200
        
    except Exception as e:
        logger.error(f"Feedback processing error: {e}")
        return jsonify({
            'success': False,
            'error': 'Internal server error'
        }), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Endpoint not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500

@app.errorhandler(429)
def rate_limit_exceeded(error):
    return jsonify({
        'success': False,
        'error': 'Rate limit exceeded'
    }), 429

# JWT error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({
        'success': False,
        'error': 'Token has expired'
    }), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({
        'success': False,
        'error': 'Invalid token'
    }), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({
        'success': False,
        'error': 'Authorization token is required'
    }), 401

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
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug,
        threaded=True
    )

---

# ai-engine/src/services/prediction_service.py
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import logging
from ..utils.logger import setup_logger

logger = setup_logger(__name__)

class PredictionService:
    """Service for handling prediction requests"""
    
    def __init__(self, model_manager):
        self.model_manager = model_manager
        
    def predict_campaign_performance(
        self,
        campaign_id: str,
        days: int,
        metrics: List[str],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Predict campaign performance for specified days
        """
        try:
            # Get historical data for the campaign
            historical_data = self._get_historical_data(campaign_id, user_id)
            
            if historical_data.empty:
                raise ValueError("No historical data available for this campaign")
            
            predictions = {}
            
            for metric in metrics:
                if metric not in historical_data.columns:
                    logger.warning(f"Metric {metric} not found in historical data")
                    continue
                    
                # Get the appropriate model
                model = self.model_manager.get_model('performance_predictor', metric)
                
                if model is None:
                    logger.warning(f"No model available for metric {metric}")
                    continue
                
                # Prepare features
                features = self._prepare_features(historical_data, metric)
                
                # Make prediction
                prediction = model.predict(features, days)
                
                predictions[metric] = {
                    'values': prediction['values'].tolist(),
                    'dates': prediction['dates'],
                    'confidence_intervals': prediction.get('confidence_intervals', []),
                    'accuracy': prediction.get('accuracy', 0.0)
                }
            
            return {
                'campaign_id': campaign_id,
                'predictions': predictions,
                'forecast_period': days,
                'generated_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Performance prediction error: {e}")
            raise
    
    def predict_budget_impact(
        self,
        campaign_ids: List[str],
        budget_scenarios: List[Dict],
        user_id: str
    ) -> Dict[str, Any]:
        """
        Predict the impact of different budget allocations
        """
        try:
            results = {}
            
            for scenario in budget_scenarios:
                scenario_results = {}
                
                for campaign_id in campaign_ids:
                    # Get historical data
                    historical_data = self._get_historical_data(campaign_id, user_id)
                    
                    if historical_data.empty:
                        continue
                    
                    # Get budget impact model
                    model = self.model_manager.get_model('budget_impact_predictor')
                    
                    if model is None:
                        continue
                    
                    # Prepare features with budget scenario
                    features = self._prepare_budget_features(
                        historical_data,
                        scenario['budget'],
                        campaign_id
                    )
                    
                    # Predict impact
                    prediction = model.predict(features)
                    
                    scenario_results[campaign_id] = {
                        'predicted_spend': prediction.get('spend', 0),
                        'predicted_clicks': prediction.get('clicks', 0),
                        'predicted_conversions': prediction.get('conversions', 0),
                        'predicted_roas': prediction.get('roas', 0),
                        'confidence': prediction.get('confidence', 0)
                    }
                
                results[scenario['name']] = scenario_results
            
            return {
                'scenarios': results,
                'generated_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Budget impact prediction error: {e}")
            raise
    
    def _get_historical_data(self, campaign_id: str, user_id: str) -> pd.DataFrame:
        """
        Get historical data for a campaign
        """
        # This would typically query the database
        # For now, return empty DataFrame
        logger.info(f"Fetching historical data for campaign {campaign_id}")
        return pd.DataFrame()
    
    def _prepare_features(self, data: pd.DataFrame, metric: str) -> np.ndarray:
        """
        Prepare features for prediction
        """
        # Basic feature engineering
        features = []
        
        # Add time-based features
        if 'date' in data.columns:
            data['date'] = pd.to_datetime(data['date'])
            data['day_of_week'] = data['date'].dt.dayofweek
            data['month'] = data['date'].dt.month
            data['quarter'] = data['date'].dt.quarter
            features.extend(['day_of_week', 'month', 'quarter'])
        
        # Add lag features
        if metric in data.columns:
            data[f'{metric}_lag_1'] = data[metric].shift(1)
            data[f'{metric}_lag_7'] = data[metric].shift(7)
            features.extend([f'{metric}_lag_1', f'{metric}_lag_7'])
        
        # Add rolling statistics
        if metric in data.columns:
            data[f'{metric}_rolling_mean_7'] = data[metric].rolling(7).mean()
            data[f'{metric}_rolling_std_7'] = data[metric].rolling(7).std()
            features.extend([f'{metric}_rolling_mean_7', f'{metric}_rolling_std_7'])
        
        # Select features that exist in the data
        available_features = [f for f in features if f in data.columns]
        
        if not available_features:
            logger.warning("No features available for prediction")
            return np.array([])
        
        return data[available_features].fillna(0).values
    
    def _prepare_budget_features(
        self,
        data: pd.DataFrame,
        budget: float,
        campaign_id: str
    ) -> np.ndarray:
        """
        Prepare features for budget impact prediction
        """
        # This is a simplified version
        # In reality, this would be more sophisticated
        features = []
        
        # Current performance metrics
        if 'spend' in data.columns:
            features.append(data['spend'].mean())
        if 'clicks' in data.columns:
            features.append(data['clicks'].mean())
        if 'conversions' in data.columns:
            features.append(data['conversions'].mean())
        
        # Budget information
        features.append(budget)
        
        # Add more sophisticated features here
        
        return np.array(features).reshape(1, -1)

---

# ai-engine/src/utils/logger.py
import logging
import os
from datetime import datetime

def setup_logger(name: str) -> logging.Logger:
    """Setup logger with consistent formatting"""
    
    # Create logger
    logger = logging.getLogger(name)
    
    # Set level
    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    logger.setLevel(getattr(logging, log_level))
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Create file handler
    log_dir = os.getenv('LOG_DIR', 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f'ai-engine-{datetime.now().strftime("%Y-%m-%d")}.log')
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    return logger