#!/usr/bin/env python3
"""
Content generation model for ad creatives using NLP
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import logging
from transformers import GPT2LMHeadModel, GPT2Tokenizer, pipeline
import torch
import spacy
from textblob import TextBlob
import random

logger = logging.getLogger(__name__)


class ContentGenerator:
    """Generate ad content using NLP models"""
    
    def __init__(self, model_name: str = "gpt2"):
        """Initialize content generator"""
        self.model_name = model_name
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = None
        self.tokenizer = None
        self.generator = None
        self.nlp = None
        self.templates = self._load_templates()
        self.load_model()
    
    def load_model(self):
        """Load pre-trained language model"""
        try:
            logger.info(f"Loading content generation model: {self.model_name}")
            
            # Load tokenizer and model
            self.tokenizer = GPT2Tokenizer.from_pretrained(self.model_name)
            self.model = GPT2LMHeadModel.from_pretrained(self.model_name)
            self.model.to(self.device)
            
            # Set pad token
            self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Create text generation pipeline
            self.generator = pipeline(
                "text-generation",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if torch.cuda.is_available() else -1
            )
            
            # Load spaCy for text analysis
            self.nlp = spacy.load("en_core_web_sm")
            
            logger.info("Content generation model loaded successfully")
            
        except Exception as e:
            logger.error(f"Failed to load content generation model: {e}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self.model is not None and self.tokenizer is not None
    
    def generate_ad_copy(self, 
                        product: str,
                        target_audience: str,
                        platform: str,
                        tone: str = "professional",
                        max_length: int = 100) -> List[Dict[str, str]]:
        """Generate ad copy variations"""
        try:
            # Generate prompts based on platform
            prompts = self._create_prompts(product, target_audience, platform, tone)
            
            ad_copies = []
            
            for prompt in prompts:
                # Generate text
                generated = self.generator(
                    prompt,
                    max_length=max_length,
                    num_return_sequences=3,
                    temperature=0.8,
                    top_p=0.9,
                    do_sample=True
                )
                
                for result in generated:
                    text = result['generated_text']
                    # Extract only the generated part
                    text = text.replace(prompt, "").strip()
                    
                    # Post-process and validate
                    if self._validate_ad_copy(text, platform):
                        ad_copies.append({
                            'text': text,
                            'platform': platform,
                            'tone': tone,
                            'sentiment': self._analyze_sentiment(text),
                            'readability': self._calculate_readability(text),
                            'keywords': self._extract_keywords(text)
                        })
            
            # Add template-based variations
            template_copies = self._generate_from_templates(
                product, target_audience, platform, tone
            )
            ad_copies.extend(template_copies)
            
            # Rank and return top variations
            return self._rank_ad_copies(ad_copies)[:5]
            
        except Exception as e:
            logger.error(f"Error generating ad copy: {e}")
            return self._generate_fallback_copies(product, platform)
    
    def generate_headlines(self,
                         product: str,
                         keywords: List[str],
                         platform: str,
                         count: int = 10) -> List[str]:
        """Generate headlines for ads"""
        headlines = []
        
        # Platform-specific character limits
        char_limits = {
            'GOOGLE_ADS': 30,
            'FACEBOOK_ADS': 40,
            'LINKEDIN_ADS': 50,
            'TWITTER_ADS': 50,
            'TIKTOK_ADS': 40
        }
        
        max_chars = char_limits.get(platform, 40)
        
        # Generate using keywords
        for keyword in keywords[:3]:
            prompt = f"Write a compelling headline about {product} featuring {keyword}:"
            
            generated = self.generator(
                prompt,
                max_length=50,
                num_return_sequences=2,
                temperature=0.7
            )
            
            for result in generated:
                headline = result['generated_text'].replace(prompt, "").strip()
                headline = headline.split('\n')[0]  # Take first line only
                
                if len(headline) <= max_chars and len(headline) > 10:
                    headlines.append(headline)
        
        # Add template-based headlines
        template_headlines = [
            f"Best {product} for {keywords[0]}" if keywords else f"Best {product}",
            f"Save on {product} Today",
            f"Get {product} - Limited Offer",
            f"{product}: {keywords[0].title()} Solution" if keywords else f"{product} Solution",
            f"Transform Your {keywords[0]} with {product}" if keywords else f"Transform with {product}"
        ]
        
        for headline in template_headlines:
            if len(headline) <= max_chars:
                headlines.append(headline)
        
        return list(set(headlines))[:count]
    
    def generate_descriptions(self,
                            product: str,
                            features: List[str],
                            platform: str,
                            tone: str = "informative") -> List[str]:
        """Generate product descriptions"""
        descriptions = []
        
        # Platform-specific length limits
        length_limits = {
            'GOOGLE_ADS': 90,
            'FACEBOOK_ADS': 125,
            'LINKEDIN_ADS': 150,
            'INSTAGRAM_ADS': 125,
            'TIKTOK_ADS': 100
        }
        
        max_chars = length_limits.get(platform, 125)
        
        # Create feature string
        feature_str = ", ".join(features[:3]) if features else "amazing features"
        
        # Generate using different angles
        angles = [
            f"Discover {product} with {feature_str}.",
            f"Why choose {product}? {feature_str}.",
            f"Experience the benefits of {product}.",
            f"Get {product} and enjoy {feature_str}."
        ]
        
        for angle in angles:
            prompt = f"{angle} Tell me more:"
            
            generated = self.generator(
                prompt,
                max_length=max_chars + 50,
                num_return_sequences=1,
                temperature=0.7
            )
            
            for result in generated:
                desc = result['generated_text'].replace(prompt, "").strip()
                desc = self._truncate_to_sentence(desc, max_chars)
                
                if len(desc) > 20:
                    descriptions.append(desc)
        
        return descriptions
    
    def optimize_existing_copy(self,
                             existing_copy: str,
                             performance_data: Dict[str, float],
                             platform: str) -> Dict[str, Any]:
        """Optimize existing ad copy based on performance"""
        try:
            # Analyze current copy
            analysis = self._analyze_copy(existing_copy)
            
            # Identify improvement areas
            improvements = []
            
            if performance_data.get('ctr', 0) < 0.02:  # Low CTR
                improvements.append('more compelling call-to-action')
                improvements.append('stronger value proposition')
            
            if performance_data.get('cvr', 0) < 0.01:  # Low conversion
                improvements.append('clearer benefits')
                improvements.append('urgency elements')
            
            # Generate improved version
            prompt = f"Improve this ad copy with {', '.join(improvements)}: {existing_copy}"
            
            generated = self.generator(
                prompt,
                max_length=len(existing_copy) + 50,
                num_return_sequences=3,
                temperature=0.7
            )
            
            optimized_copies = []
            for result in generated:
                optimized = result['generated_text'].replace(prompt, "").strip()
                if self._validate_ad_copy(optimized, platform):
                    optimized_copies.append({
                        'text': optimized,
                        'improvements': improvements,
                        'expected_ctr_lift': self._estimate_improvement(analysis, optimized)
                    })
            
            return {
                'original': existing_copy,
                'optimized_versions': optimized_copies,
                'recommendations': self._get_copy_recommendations(analysis, performance_data)
            }
            
        except Exception as e:
            logger.error(f"Error optimizing copy: {e}")
            return {
                'original': existing_copy,
                'optimized_versions': [],
                'recommendations': ['Consider A/B testing different value propositions']
            }
    
    def _create_prompts(self, product: str, audience: str, 
                       platform: str, tone: str) -> List[str]:
        """Create prompts for text generation"""
        base_prompts = [
            f"Write a {tone} {platform} ad for {product} targeting {audience}:",
            f"Create compelling ad copy for {product} that appeals to {audience}:",
            f"Generate a {tone} advertisement for {product}. Target audience: {audience}."
        ]
        
        return base_prompts
    
    def _validate_ad_copy(self, text: str, platform: str) -> bool:
        """Validate generated ad copy"""
        if not text or len(text) < 10:
            return False
        
        # Check for inappropriate content
        inappropriate_words = ['hate', 'violence', 'discriminate']
        if any(word in text.lower() for word in inappropriate_words):
            return False
        
        # Platform-specific validation
        if platform == 'GOOGLE_ADS' and len(text) > 90:
            return False
        elif platform == 'FACEBOOK_ADS' and len(text) > 125:
            return False
        
        return True
    
    def _analyze_sentiment(self, text: str) -> Dict[str, float]:
        """Analyze sentiment of text"""
        blob = TextBlob(text)
        return {
            'polarity': blob.sentiment.polarity,
            'subjectivity': blob.sentiment.subjectivity,
            'sentiment': 'positive' if blob.sentiment.polarity > 0 else 'negative'
        }
    
    def _calculate_readability(self, text: str) -> float:
        """Calculate readability score"""
        # Simple Flesch Reading Ease approximation
        words = text.split()
        sentences = text.count('.') + text.count('!') + text.count('?')
        sentences = max(1, sentences)
        
        avg_sentence_length = len(words) / sentences
        
        # Simplified readability score (0-100)
        readability = max(0, min(100, 100 - (avg_sentence_length * 2)))
        return readability
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text"""
        doc = self.nlp(text)
        keywords = []
        
        # Extract nouns and proper nouns
        for token in doc:
            if token.pos_ in ['NOUN', 'PROPN'] and not token.is_stop:
                keywords.append(token.text.lower())
        
        # Extract noun phrases
        for chunk in doc.noun_chunks:
            if len(chunk.text.split()) <= 3:
                keywords.append(chunk.text.lower())
        
        return list(set(keywords))
    
    def _rank_ad_copies(self, copies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Rank ad copies by quality"""
        for copy in copies:
            # Calculate quality score
            score = 0
            
            # Sentiment score
            if copy['sentiment']['polarity'] > 0:
                score += 2
            
            # Readability score
            score += copy['readability'] / 20
            
            # Keyword density
            text_words = copy['text'].lower().split()
            keyword_density = len(copy['keywords']) / max(1, len(text_words))
            score += min(2, keyword_density * 10)
            
            copy['quality_score'] = score
        
        # Sort by quality score
        return sorted(copies, key=lambda x: x['quality_score'], reverse=True)
    
    def _generate_from_templates(self, product: str, audience: str,
                               platform: str, tone: str) -> List[Dict[str, Any]]:
        """Generate copies from templates"""
        copies = []
        
        for template in self.templates.get(platform, []):
            text = template.format(
                product=product,
                audience=audience,
                cta=random.choice(['Shop Now', 'Learn More', 'Get Started', 'Try Today'])
            )
            
            copies.append({
                'text': text,
                'platform': platform,
                'tone': tone,
                'sentiment': self._analyze_sentiment(text),
                'readability': self._calculate_readability(text),
                'keywords': self._extract_keywords(text),
                'is_template': True
            })
        
        return copies
    
    def _load_templates(self) -> Dict[str, List[str]]:
        """Load ad copy templates"""
        return {
            'GOOGLE_ADS': [
                "{product} for {audience}. {cta}!",
                "Best {product} Solution. Perfect for {audience}. {cta}",
                "Get {product} Today. Ideal for {audience}. {cta} →"
            ],
            'FACEBOOK_ADS': [
                "Discover {product} - designed specially for {audience}. {cta} and transform your experience!",
                "🎯 {audience}! Check out our {product}. Limited time offer. {cta}!",
                "Looking for {product}? Perfect solution for {audience}. {cta} now!"
            ],
            'LINKEDIN_ADS': [
                "Elevate your business with {product}. Tailored for {audience}. {cta} to learn more.",
                "Professional {product} solution for {audience}. Boost productivity today. {cta}",
                "Industry-leading {product} for {audience}. See why thousands trust us. {cta}"
            ]
        }
    
    def _truncate_to_sentence(self, text: str, max_length: int) -> str:
        """Truncate text to complete sentence within limit"""
        if len(text) <= max_length:
            return text
        
        # Find last sentence boundary before limit
        sentences = text.split('. ')
        result = ""
        
        for sentence in sentences:
            if len(result + sentence + ".") <= max_length:
                result = result + sentence + ". " if result else sentence + "."
            else:
                break
        
        return result.strip()
    
    def _analyze_copy(self, text: str) -> Dict[str, Any]:
        """Analyze ad copy characteristics"""
        doc = self.nlp(text)
        
        return {
            'length': len(text),
            'word_count': len(text.split()),
            'sentences': len(list(doc.sents)),
            'has_cta': any(cta in text.lower() for cta in ['buy', 'shop', 'get', 'try', 'learn']),
            'has_urgency': any(word in text.lower() for word in ['now', 'today', 'limited', 'hurry']),
            'sentiment': self._analyze_sentiment(text),
            'readability': self._calculate_readability(text)
        }
    
    def _estimate_improvement(self, original_analysis: Dict, optimized_text: str) -> float:
        """Estimate CTR improvement"""
        optimized_analysis = self._analyze_copy(optimized_text)
        
        improvement = 0.0
        
        # CTA improvement
        if not original_analysis['has_cta'] and optimized_analysis['has_cta']:
            improvement += 0.15
        
        # Urgency improvement
        if not original_analysis['has_urgency'] and optimized_analysis['has_urgency']:
            improvement += 0.10
        
        # Readability improvement
        readability_diff = optimized_analysis['readability'] - original_analysis['readability']
        improvement += readability_diff / 100 * 0.1
        
        return max(0, min(0.5, improvement))  # Cap at 50% improvement
    
    def _get_copy_recommendations(self, analysis: Dict, performance: Dict) -> List[str]:
        """Get recommendations for copy improvement"""
        recommendations = []
        
        if not analysis['has_cta']:
            recommendations.append("Add a clear call-to-action (CTA)")
        
        if not analysis['has_urgency'] and performance.get('ctr', 0) < 0.02:
            recommendations.append("Include urgency elements (limited time, etc.)")
        
        if analysis['readability'] < 60:
            recommendations.append("Simplify language for better readability")
        
        if analysis['word_count'] > 20:
            recommendations.append("Consider shorter, punchier copy")
        
        if analysis['sentiment']['polarity'] < 0:
            recommendations.append("Use more positive language")
        
        return recommendations
    
    def _generate_fallback_copies(self, product: str, platform: str) -> List[Dict[str, str]]:
        """Generate fallback copies when model fails"""
        return [
            {
                'text': f"Discover {product} - Your perfect solution. Shop now!",
                'platform': platform,
                'tone': 'professional',
                'sentiment': {'polarity': 0.5, 'sentiment': 'positive'},
                'readability': 80,
                'keywords': [product.lower()]
            }
        ]