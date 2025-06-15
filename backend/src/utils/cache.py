"""
Cache utilities
"""

import json
import redis
from typing import Any, Optional, Union
from functools import wraps
import hashlib
import pickle
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class CacheClient:
    """Redis cache client"""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=settings.REDIS_URL.split("://")[1].split(":")[0],
            port=int(settings.REDIS_URL.split(":")[-1].split("/")[0]),
            password=settings.REDIS_PASSWORD,
            decode_responses=False  # We'll handle encoding/decoding
        )
        self.prefix = settings.CACHE_KEY_PREFIX
        self.default_ttl = settings.CACHE_TTL
    
    def _make_key(self, key: str) -> str:
        """Create cache key with prefix"""
        return f"{self.prefix}:{key}"
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        try:
            full_key = self._make_key(key)
            value = self.redis_client.get(full_key)
            
            if value is None:
                return None
            
            # Try to deserialize
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                # Try pickle for complex objects
                try:
                    return pickle.loads(value)
                except:
                    return value.decode('utf-8')
                    
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache"""
        try:
            full_key = self._make_key(key)
            ttl = ttl or self.default_ttl
            
            # Serialize value
            try:
                serialized = json.dumps(value)
            except (TypeError, ValueError):
                # Use pickle for complex objects
                serialized = pickle.dumps(value)
            
            return bool(self.redis_client.setex(full_key, ttl, serialized))
            
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete value from cache"""
        try:
            full_key = self._make_key(key)
            return bool(self.redis_client.delete(full_key))
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """Check if key exists"""
        try:
            full_key = self._make_key(key)
            return bool(self.redis_client.exists(full_key))
        except Exception as e:
            logger.error(f"Cache exists error: {e}")
            return False
    
    def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern"""
        try:
            full_pattern = self._make_key(pattern)
            keys = self.redis_client.keys(full_pattern)
            
            if keys:
                return self.redis_client.delete(*keys)
            return 0
            
        except Exception as e:
            logger.error(f"Cache clear pattern error: {e}")
            return 0
    
    def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """Increment counter"""
        try:
            full_key = self._make_key(key)
            return self.redis_client.incrby(full_key, amount)
        except Exception as e:
            logger.error(f"Cache increment error: {e}")
            return None
    
    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple values"""
        try:
            full_keys = [self._make_key(k) for k in keys]
            values = self.redis_client.mget(full_keys)
            
            result = {}
            for key, value in zip(keys, values):
                if value is not None:
                    try:
                        result[key] = json.loads(value)
                    except:
                        try:
                            result[key] = pickle.loads(value)
                        except:
                            result[key] = value.decode('utf-8')
            
            return result
            
        except Exception as e:
            logger.error(f"Cache get many error: {e}")
            return {}
    
    def set_many(self, mapping: Dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Set multiple values"""
        try:
            ttl = ttl or self.default_ttl
            pipe = self.redis_client.pipeline()
            
            for key, value in mapping.items():
                full_key = self._make_key(key)
                
                try:
                    serialized = json.dumps(value)
                except:
                    serialized = pickle.dumps(value)
                
                pipe.setex(full_key, ttl, serialized)
            
            pipe.execute()
            return True
            
        except Exception as e:
            logger.error(f"Cache set many error: {e}")
            return False


# Singleton instance
cache_client = CacheClient()


def cache_key_wrapper(*args, **kwargs):
    """Generate cache key from function arguments"""
    key_parts = []
    
    # Add args
    for arg in args:
        if hasattr(arg, 'id'):
            key_parts.append(str(arg.id))
        else:
            key_parts.append(str(arg))
    
    # Add kwargs
    for k, v in sorted(kwargs.items()):
        if hasattr(v, 'id'):
            key_parts.append(f"{k}:{v.id}")
        else:
            key_parts.append(f"{k}:{v}")
    
    # Create hash for long keys
    key_str = ":".join(key_parts)
    if len(key_str) > 200:
        key_str = hashlib.md5(key_str.encode()).hexdigest()
    
    return key_str


def cached(ttl: Optional[int] = None, key_prefix: Optional[str] = None):
    """Cache decorator"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix or func.__name__}:{cache_key_wrapper(*args, **kwargs)}"
            
            # Try to get from cache
            cached_value = cache_client.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Call function
            result = await func(*args, **kwargs)
            
            # Cache result
            cache_client.set(cache_key, result, ttl)
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix or func.__name__}:{cache_key_wrapper(*args, **kwargs)}"
            
            # Try to get from cache
            cached_value = cache_client.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Call function
            result = func(*args, **kwargs)
            
            # Cache result
            cache_client.set(cache_key, result, ttl)
            
            return result
        
        # Return appropriate wrapper
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def invalidate_cache(pattern: str):
    """Invalidate cache by pattern"""
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Call function
            result = await func(*args, **kwargs)
            
            # Clear cache
            cache_client.clear_pattern(pattern)
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Call function
            result = func(*args, **kwargs)
            
            # Clear cache
            cache_client.clear_pattern(pattern)
            
            return result
        
        # Return appropriate wrapper
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


# Cache key generators for common patterns
def user_cache_key(user_id: str, suffix: str = "") -> str:
    """Generate user-specific cache key"""
    return f"user:{user_id}:{suffix}" if suffix else f"user:{user_id}"


def campaign_cache_key(campaign_id: str, suffix: str = "") -> str:
    """Generate campaign-specific cache key"""
    return f"campaign:{campaign_id}:{suffix}" if suffix else f"campaign:{campaign_id}"


def metrics_cache_key(campaign_id: str, date_range: str, metrics: List[str]) -> str:
    """Generate metrics cache key"""
    metrics_str = ":".join(sorted(metrics))
    return f"metrics:{campaign_id}:{date_range}:{hashlib.md5(metrics_str.encode()).hexdigest()}"