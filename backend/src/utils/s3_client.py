"""
S3 Client utility for file storage
"""

import boto3
from botocore.exceptions import ClientError
import logging
from typing import Optional, Dict, Any
from app.core.config import settings
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class S3Client:
    """AWS S3 client wrapper"""
    
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION
        )
        self.executor = ThreadPoolExecutor(max_workers=5)
    
    async def upload_file(self,
                         bucket: str,
                         key: str,
                         content: bytes,
                         content_type: Optional[str] = None,
                         metadata: Optional[Dict[str, str]] = None) -> bool:
        """Upload file to S3"""
        try:
            extra_args = {}
            
            if content_type:
                extra_args['ContentType'] = content_type
            
            if metadata:
                extra_args['Metadata'] = metadata
            
            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.put_object(
                    Bucket=bucket,
                    Key=key,
                    Body=content,
                    **extra_args
                )
            )
            
            logger.info(f"Successfully uploaded file to s3://{bucket}/{key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error uploading file to S3: {e}")
            return False
    
    async def download_file(self, bucket: str, key: str) -> Optional[bytes]:
        """Download file from S3"""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_object(Bucket=bucket, Key=key)
            )
            
            content = response['Body'].read()
            logger.info(f"Successfully downloaded file from s3://{bucket}/{key}")
            return content
            
        except ClientError as e:
            logger.error(f"Error downloading file from S3: {e}")
            return None
    
    async def delete_file(self, bucket: str, key: str) -> bool:
        """Delete file from S3"""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.delete_object(Bucket=bucket, Key=key)
            )
            
            logger.info(f"Successfully deleted file from s3://{bucket}/{key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error deleting file from S3: {e}")
            return False
    
    async def generate_presigned_url(self,
                                   bucket: str,
                                   key: str,
                                   expiration: int = 3600) -> Optional[str]:
        """Generate presigned URL for file access"""
        try:
            loop = asyncio.get_event_loop()
            url = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': bucket, 'Key': key},
                    ExpiresIn=expiration
                )
            )
            
            return url
            
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None
    
    async def list_files(self,
                        bucket: str,
                        prefix: Optional[str] = None,
                        max_keys: int = 1000) -> List[Dict[str, Any]]:
        """List files in S3 bucket"""
        try:
            params = {
                'Bucket': bucket,
                'MaxKeys': max_keys
            }
            
            if prefix:
                params['Prefix'] = prefix
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.list_objects_v2(**params)
            )
            
            files = []
            for obj in response.get('Contents', []):
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'],
                    'etag': obj['ETag']
                })
            
            return files
            
        except ClientError as e:
            logger.error(f"Error listing files from S3: {e}")
            return []
    
    async def copy_file(self,
                       source_bucket: str,
                       source_key: str,
                       dest_bucket: str,
                       dest_key: str) -> bool:
        """Copy file within S3"""
        try:
            copy_source = {'Bucket': source_bucket, 'Key': source_key}
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.copy_object(
                    CopySource=copy_source,
                    Bucket=dest_bucket,
                    Key=dest_key
                )
            )
            
            logger.info(f"Successfully copied s3://{source_bucket}/{source_key} to s3://{dest_bucket}/{dest_key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error copying file in S3: {e}")
            return False
    
    async def file_exists(self, bucket: str, key: str) -> bool:
        """Check if file exists in S3"""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_object(Bucket=bucket, Key=key)
            )
            return True
            
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Error checking file existence: {e}")
            return False
    
    async def get_file_metadata(self, bucket: str, key: str) -> Optional[Dict[str, Any]]:
        """Get file metadata from S3"""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_object(Bucket=bucket, Key=key)
            )
            
            return {
                'content_type': response.get('ContentType'),
                'content_length': response.get('ContentLength'),
                'last_modified': response.get('LastModified'),
                'etag': response.get('ETag'),
                'metadata': response.get('Metadata', {})
            }
            
        except ClientError as e:
            logger.error(f"Error getting file metadata: {e}")
            return None
    
    def __del__(self):
        """Cleanup executor on deletion"""
        if hasattr(self, 'executor'):
            self.executor.shutdown(wait=False)


# Singleton instance
s3_client = S3Client()