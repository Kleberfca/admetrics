#!/usr/bin/env python3
"""
Sentiment analysis for ad comments and brand mentions
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import logging
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch
from textblob import TextBlob
import spacy
from collections import Counter
import re

logger = logging.getLogger(__name__)


class SentimentAnalyzer:
    """Analyze sentiment in comments and social media interactions"""
    
    def __init__(self, model_name: str = "distilbert-base-uncased-finetuned-sst-2-english"):
        """Initialize sentiment analyzer"""
        self.model_name = model_name
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.sentiment_pipeline = None
        self.tokenizer = None
        self.model = None
        self.nlp = None
        self.emotion_lexicon = self._load_emotion_lexicon()
        self.load_model()
    
    def load_model(self):
        """Load pre-trained sentiment analysis model"""
        try:
            logger.info(f"Loading sentiment analysis model: {self.model_name}")
            
            # Load transformer model
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
            self.model.to(self.device)
            
            # Create sentiment analysis pipeline
            self.sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if torch.cuda.is_available() else -1
            )
            
            # Load spaCy for additional NLP tasks
            self.nlp = spacy.load("en_core_web_sm")
            
            logger.info("Sentiment analysis model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load sentiment analysis model: {e}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.sentiment_pipeline is not None
    
    def analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of a single text"""
        try:
            # Clean text
            clean_text = self._preprocess_text(text)
            
            # Get transformer sentiment
            transformer_result = self.sentiment_pipeline(clean_text[:512])[0]  # Truncate for BERT
            
            # Get TextBlob sentiment for comparison
            blob = TextBlob(clean_text)
            
            # Analyze emotions
            emotions = self._detect_emotions(clean_text)
            
            # Analyze aspects
            aspects = self._extract_aspects(clean_text)
            
            return {
                'text': text,
                'clean_text': clean_text,
                'sentiment': transformer_result['label'].lower(),
                'confidence': transformer_result['score'],
                'polarity': blob.sentiment.polarity,
                'subjectivity': blob.sentiment.subjectivity,
                'emotions': emotions,
                'aspects': aspects,
                'is_question': self._is_question(clean_text),
                'has_complaint': self._has_complaint(clean_text),
                'urgency': self._detect_urgency(clean_text)
            }
            
        except Exception as e:
            logger.error(f"Error analyzing sentiment: {e}")
            return self._get_default_sentiment(text)
    
    def analyze_batch(self, texts: List[str], batch_size: int = 32) -> List[Dict[str, Any]]:
        """Analyze sentiment for multiple texts"""
        results = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            # Clean texts
            clean_batch = [self._preprocess_text(text)[:512] for text in batch]
            
            # Get sentiments
            try:
                batch_results = self.sentiment_pipeline(clean_batch)
                
                for j, (text, result) in enumerate(zip(batch, batch_results)):
                    analysis = {
                        'text': text,
                        'sentiment': result['label'].lower(),
                        'confidence': result['score']
                    }
                    
                    # Add additional analysis
                    blob = TextBlob(clean_batch[j])
                    analysis['polarity'] = blob.sentiment.polarity
                    analysis['subjectivity'] = blob.sentiment.subjectivity
                    
                    results.append(analysis)
                    
            except Exception as e:
                logger.error(f"Error in batch analysis: {e}")
                # Fallback to individual analysis
                for text in batch:
                    results.append(self.analyze_sentiment(text))
        
        return results
    
    def analyze_campaign_feedback(self, comments: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze overall sentiment for campaign feedback"""
        if not comments:
            return self._get_empty_campaign_analysis()
        
        # Analyze each comment
        analyses = []
        for comment in comments:
            text = comment.get('text', '')
            if text:
                analysis = self.analyze_sentiment(text)
                analysis['engagement_type'] = comment.get('type', 'comment')
                analysis['likes'] = comment.get('likes', 0)
                analysis['replies'] = comment.get('replies', 0)
                analyses.append(analysis)
        
        # Aggregate results
        total_comments = len(analyses)
        
        # Sentiment distribution
        sentiment_counts = Counter(a['sentiment'] for a in analyses)
        sentiment_distribution = {
            'positive': sentiment_counts.get('positive', 0) / total_comments,
            'negative': sentiment_counts.get('negative', 0) / total_comments,
            'neutral': sentiment_counts.get('neutral', 0) / total_comments
        }
        
        # Average polarity
        avg_polarity = np.mean([a['polarity'] for a in analyses])
        avg_subjectivity = np.mean([a['subjectivity'] for a in analyses])
        
        # Emotion analysis
        all_emotions = []
        for a in analyses:
            all_emotions.extend(a.get('emotions', []))
        emotion_counts = Counter(all_emotions)
        
        # Aspect analysis
        all_aspects = []
        for a in analyses:
            all_aspects.extend([asp['aspect'] for asp in a.get('aspects', [])])
        aspect_counts = Counter(all_aspects)
        
        # Issue detection
        questions = [a for a in analyses if a.get('is_question', False)]
        complaints = [a for a in analyses if a.get('has_complaint', False)]
        urgent_issues = [a for a in analyses if a.get('urgency', 'low') == 'high']
        
        # Engagement-weighted sentiment
        weighted_sentiment = self._calculate_weighted_sentiment(analyses)
        
        return {
            'total_analyzed': total_comments,
            'sentiment_distribution': sentiment_distribution,
            'average_polarity': avg_polarity,
            'average_subjectivity': avg_subjectivity,
            'weighted_sentiment': weighted_sentiment,
            'dominant_emotions': dict(emotion_counts.most_common(5)),
            'top_aspects': dict(aspect_counts.most_common(10)),
            'questions_count': len(questions),
            'complaints_count': len(complaints),
            'urgent_issues_count': len(urgent_issues),
            'sentiment_trend': self._calculate_sentiment_trend(analyses),
            'recommendations': self._generate_recommendations(analyses, sentiment_distribution)
        }
    
    def monitor_brand_mentions(self, mentions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Monitor sentiment in brand mentions across platforms"""
        platform_sentiments = {}
        
        # Group by platform
        from itertools import groupby
        mentions_sorted = sorted(mentions, key=lambda x: x.get('platform', 'unknown'))
        
        for platform, platform_mentions in groupby(mentions_sorted, key=lambda x: x.get('platform', 'unknown')):
            platform_list = list(platform_mentions)
            platform_sentiments[platform] = self.analyze_campaign_feedback(platform_list)
        
        # Overall metrics
        all_analyses = []
        for platform_data in platform_sentiments.values():
            # Reconstruct individual analyses from aggregated data
            total = platform_data['total_analyzed']
            for sentiment, ratio in platform_data['sentiment_distribution'].items():
                count = int(total * ratio)
                for _ in range(count):
                    all_analyses.append({'sentiment': sentiment})
        
        # Calculate overall sentiment health score
        health_score = self._calculate_sentiment_health_score(platform_sentiments)
        
        return {
            'platform_sentiments': platform_sentiments,
            'overall_health_score': health_score,
            'alerts': self._generate_sentiment_alerts(platform_sentiments),
            'trending_topics': self._extract_trending_topics(mentions),
            'sentiment_velocity': self._calculate_sentiment_velocity(mentions)
        }
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for analysis"""
        # Convert to lowercase
        text = text.lower()
        
        # Remove URLs
        text = re.sub(r'https?://\S+|www.\S+', '', text)
        
        # Remove mentions and hashtags but keep the text
        text = re.sub(r'@\w+', '', text)
        text = re.sub(r'#(\w+)', r'\1', text)
        
        # Remove extra whitespace
        text = ' '.join(text.split())
        
        return text.strip()
    
    def _detect_emotions(self, text: str) -> List[str]:
        """Detect emotions in text"""
        emotions = []
        
        # Check emotion lexicon
        text_lower = text.lower()
        for emotion, words in self.emotion_lexicon.items():
            if any(word in text_lower for word in words):
                emotions.append(emotion)
        
        # Use TextBlob for basic emotion detection
        blob = TextBlob(text)
        if blob.sentiment.polarity > 0.5:
            emotions.append('joy')
        elif blob.sentiment.polarity < -0.5:
            emotions.append('anger')
        
        return list(set(emotions))
    
    def _extract_aspects(self, text: str) -> List[Dict[str, Any]]:
        """Extract aspects and their sentiments"""
        aspects = []
        doc = self.nlp(text)
        
        # Common advertising aspects
        aspect_keywords = {
            'price': ['price', 'cost', 'expensive', 'cheap', 'affordable', 'value'],
            'quality': ['quality', 'good', 'bad', 'excellent', 'poor', 'great'],
            'service': ['service', 'support', 'help', 'customer', 'response'],
            'delivery': ['delivery', 'shipping', 'fast', 'slow', 'arrived'],
            'product': ['product', 'item', 'purchase', 'bought', 'order'],
            'experience': ['experience', 'easy', 'difficult', 'simple', 'complicated']
        }
        
        for aspect, keywords in aspect_keywords.items():
            for keyword in keywords:
                if keyword in text.lower():
                    # Find sentiment around aspect
                    sentiment = self._get_aspect_sentiment(text, keyword)
                    aspects.append({
                        'aspect': aspect,
                        'keyword': keyword,
                        'sentiment': sentiment
                    })
                    break
        
        return aspects
    
    def _get_aspect_sentiment(self, text: str, aspect: str) -> str:
        """Get sentiment for specific aspect"""
        # Simple approach - check words around aspect
        words = text.lower().split()
        if aspect not in words:
            return 'neutral'
        
        idx = words.index(aspect)
        context_words = words[max(0, idx-3):idx+4]
        context_text = ' '.join(context_words)
        
        # Analyze context sentiment
        blob = TextBlob(context_text)
        if blob.sentiment.polarity > 0.1:
            return 'positive'
        elif blob.sentiment.polarity < -0.1:
            return 'negative'
        else:
            return 'neutral'
    
    def _is_question(self, text: str) -> bool:
        """Check if text is a question"""
        question_patterns = [
            r'\?$',
            r'^(what|where|when|why|how|who|which|can|could|would|should|is|are|do|does)',
            r'(anyone|anybody|someone|somebody) know'
        ]
        
        text_lower = text.lower().strip()
        return any(re.search(pattern, text_lower) for pattern in question_patterns)
    
    def _has_complaint(self, text: str) -> bool:
        """Check if text contains complaint"""
        complaint_keywords = [
            'problem', 'issue', 'wrong', 'broken', 'doesn\'t work', 'not working',
            'disappointed', 'terrible', 'horrible', 'worst', 'scam', 'fraud',
            'refund', 'return', 'cancel', 'unsubscribe'
        ]
        
        text_lower = text.lower()
        return any(keyword in text_lower for keyword in complaint_keywords)
    
    def _detect_urgency(self, text: str) -> str:
        """Detect urgency level in text"""
        high_urgency_keywords = [
            'urgent', 'asap', 'immediately', 'now', 'help', 'emergency',
            'critical', 'important', 'please help', 'need help'
        ]
        
        medium_urgency_keywords = [
            'soon', 'quickly', 'when', 'how long', 'waiting', 'still waiting'
        ]
        
        text_lower = text.lower()
        
        if any(keyword in text_lower for keyword in high_urgency_keywords):
            return 'high'
        elif any(keyword in text_lower for keyword in medium_urgency_keywords):
            return 'medium'
        else:
            return 'low'
    
    def _calculate_weighted_sentiment(self, analyses: List[Dict[str, Any]]) -> float:
        """Calculate engagement-weighted sentiment score"""
        if not analyses:
            return 0.0
        
        total_weight = 0
        weighted_sum = 0
        
        for analysis in analyses:
            # Weight by engagement
            weight = 1 + analysis.get('likes', 0) * 0.1 + analysis.get('replies', 0) * 0.2
            
            # Convert sentiment to numeric
            sentiment_value = {
                'positive': 1,
                'neutral': 0,
                'negative': -1
            }.get(analysis['sentiment'], 0)
            
            weighted_sum += sentiment_value * weight
            total_weight += weight
        
        return weighted_sum / total_weight if total_weight > 0 else 0
    
    def _calculate_sentiment_trend(self, analyses: List[Dict[str, Any]]) -> str:
        """Calculate sentiment trend over time"""
        if len(analyses) < 2:
            return 'stable'
        
        # Simple trend based on first and second half comparison
        mid_point = len(analyses) // 2
        first_half = analyses[:mid_point]
        second_half = analyses[mid_point:]
        
        first_half_positive = sum(1 for a in first_half if a['sentiment'] == 'positive') / len(first_half)
        second_half_positive = sum(1 for a in second_half if a['sentiment'] == 'positive') / len(second_half)
        
        difference = second_half_positive - first_half_positive
        
        if difference > 0.1:
            return 'improving'
        elif difference < -0.1:
            return 'declining'
        else:
            return 'stable'
    
    def _generate_recommendations(self, analyses: List[Dict[str, Any]], 
                                sentiment_dist: Dict[str, float]) -> List[str]:
        """Generate recommendations based on sentiment analysis"""
        recommendations = []
        
        # High negative sentiment
        if sentiment_dist.get('negative', 0) > 0.3:
            recommendations.append("High negative sentiment detected. Review recent campaign changes and customer feedback.")
            
            # Check common complaints
            complaints = [a for a in analyses if a.get('has_complaint', False)]
            if complaints:
                recommendations.append(f"Address {len(complaints)} customer complaints urgently.")
        
        # Many questions
        questions = [a for a in analyses if a.get('is_question', False)]
        if len(questions) > len(analyses) * 0.2:
            recommendations.append("Many questions detected. Consider creating FAQ content or improving ad clarity.")
        
        # Urgent issues
        urgent = [a for a in analyses if a.get('urgency', 'low') == 'high']
        if urgent:
            recommendations.append(f"Handle {len(urgent)} urgent customer issues immediately.")
        
        # Positive sentiment optimization
        if sentiment_dist.get('positive', 0) > 0.6:
            recommendations.append("Leverage positive sentiment by encouraging reviews and testimonials.")
        
        return recommendations
    
    def _calculate_sentiment_health_score(self, platform_sentiments: Dict[str, Dict]) -> float:
        """Calculate overall sentiment health score (0-100)"""
        if not platform_sentiments:
            return 50.0
        
        scores = []
        for platform, data in platform_sentiments.items():
            # Base score on sentiment distribution
            positive_ratio = data['sentiment_distribution'].get('positive', 0)
            negative_ratio = data['sentiment_distribution'].get('negative', 0)
            
            # Simple scoring: positive contributes positively, negative contributes negatively
            platform_score = (positive_ratio * 100) - (negative_ratio * 50)
            platform_score = max(0, min(100, platform_score))
            
            scores.append(platform_score)
        
        return np.mean(scores)
    
    def _generate_sentiment_alerts(self, platform_sentiments: Dict[str, Dict]) -> List[Dict[str, Any]]:
        """Generate alerts based on sentiment analysis"""
        alerts = []
        
        for platform, data in platform_sentiments.items():
            # High negative sentiment alert
            if data['sentiment_distribution'].get('negative', 0) > 0.4:
                alerts.append({
                    'platform': platform,
                    'type': 'high_negative_sentiment',
                    'severity': 'high',
                    'message': f"High negative sentiment on {platform} ({data['sentiment_distribution']['negative']:.1%})"
                })
            
            # Many complaints alert
            if data.get('complaints_count', 0) > 10:
                alerts.append({
                    'platform': platform,
                    'type': 'high_complaints',
                    'severity': 'medium',
                    'message': f"{data['complaints_count']} complaints detected on {platform}"
                })
            
            # Urgent issues alert
            if data.get('urgent_issues_count', 0) > 0:
                alerts.append({
                    'platform': platform,
                    'type': 'urgent_issues',
                    'severity': 'high',
                    'message': f"{data['urgent_issues_count']} urgent issues on {platform} require immediate attention"
                })
        
        return alerts
    
    def _extract_trending_topics(self, mentions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract trending topics from mentions"""
        # Extract all text
        all_text = ' '.join([m.get('text', '') for m in mentions])
        doc = self.nlp(all_text.lower())
        
        # Extract noun phrases
        noun_phrases = []
        for chunk in doc.noun_chunks:
            if len(chunk.text.split()) <= 3 and len(chunk.text) > 3:
                noun_phrases.append(chunk.text)
        
        # Count occurrences
        phrase_counts = Counter(noun_phrases)
        
        # Get top trending topics
        trending = []
        for phrase, count in phrase_counts.most_common(10):
            if count > 1:  # Mentioned more than once
                trending.append({
                    'topic': phrase,
                    'mentions': count,
                    'sentiment': self._get_topic_sentiment(mentions, phrase)
                })
        
        return trending
    
    def _get_topic_sentiment(self, mentions: List[Dict[str, Any]], topic: str) -> str:
        """Get overall sentiment for a topic"""
        topic_mentions = [m for m in mentions if topic in m.get('text', '').lower()]
        
        if not topic_mentions:
            return 'neutral'
        
        sentiments = []
        for mention in topic_mentions:
            analysis = self.analyze_sentiment(mention['text'])
            sentiments.append(analysis['sentiment'])
        
        # Return most common sentiment
        sentiment_counts = Counter(sentiments)
        return sentiment_counts.most_common(1)[0][0] if sentiment_counts else 'neutral'
    
    def _calculate_sentiment_velocity(self, mentions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate how fast sentiment is changing"""
        if len(mentions) < 2:
            return {'velocity': 0, 'direction': 'stable'}
        
        # Sort by timestamp
        sorted_mentions = sorted(mentions, key=lambda x: x.get('timestamp', 0))
        
        # Calculate sentiment scores over time windows
        window_size = max(1, len(sorted_mentions) // 10)  # 10 windows
        windows = []
        
        for i in range(0, len(sorted_mentions), window_size):
            window = sorted_mentions[i:i + window_size]
            if window:
                sentiments = [self.analyze_sentiment(m['text'])['polarity'] for m in window]
                windows.append(np.mean(sentiments))
        
        if len(windows) < 2:
            return {'velocity': 0, 'direction': 'stable'}
        
        # Calculate velocity (rate of change)
        velocities = np.diff(windows)
        avg_velocity = np.mean(velocities)
        
        # Determine direction
        if avg_velocity > 0.05:
            direction = 'improving'
        elif avg_velocity < -0.05:
            direction = 'declining'
        else:
            direction = 'stable'
        
        return {
            'velocity': float(avg_velocity),
            'direction': direction,
            'trend_strength': abs(avg_velocity)
        }
    
    def _load_emotion_lexicon(self) -> Dict[str, List[str]]:
        """Load emotion lexicon for emotion detection"""
        return {
            'joy': ['happy', 'joy', 'excited', 'love', 'wonderful', 'amazing', 'fantastic', 'great'],
            'anger': ['angry', 'mad', 'furious', 'annoyed', 'frustrated', 'irritated', 'hate'],
            'sadness': ['sad', 'unhappy', 'disappointed', 'depressed', 'sorry', 'miss'],
            'fear': ['scared', 'afraid', 'worried', 'anxious', 'nervous', 'concerned'],
            'surprise': ['surprised', 'shocked', 'amazed', 'unexpected', 'wow', 'unbelievable'],
            'disgust': ['disgusting', 'gross', 'awful', 'terrible', 'horrible', 'nasty']
        }
    
    def _get_default_sentiment(self, text: str) -> Dict[str, Any]:
        """Get default sentiment when analysis fails"""
        return {
            'text': text,
            'clean_text': text,
            'sentiment': 'neutral',
            'confidence': 0.5,
            'polarity': 0.0,
            'subjectivity': 0.5,
            'emotions': [],
            'aspects': [],
            'is_question': self._is_question(text),
            'has_complaint': False,
            'urgency': 'low'
        }
    
    def _get_empty_campaign_analysis(self) -> Dict[str, Any]:
        """Return empty campaign analysis structure"""
        return {
            'total_analyzed': 0,
            'sentiment_distribution': {
                'positive': 0,
                'negative': 0,
                'neutral': 0
            },
            'average_polarity': 0,
            'average_subjectivity': 0,
            'weighted_sentiment': 0,
            'dominant_emotions': {},
            'top_aspects': {},
            'questions_count': 0,
            'complaints_count': 0,
            'urgent_issues_count': 0,
            'sentiment_trend': 'stable',
            'recommendations': ['No data available for analysis']
        }