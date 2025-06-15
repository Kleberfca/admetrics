"""
Initial database schema

Revision ID: 001
Revises: 
Create Date: 2024-01-31 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Create enum types
    op.execute("CREATE TYPE user_role AS ENUM ('admin', 'manager', 'analyst', 'viewer')")
    op.execute("CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived')")
    op.execute("CREATE TYPE platform_type AS ENUM ('GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS')")
    op.execute("CREATE TYPE notification_type AS ENUM ('alert', 'warning', 'info', 'success', 'report', 'system')")
    op.execute("CREATE TYPE notification_priority AS ENUM ('critical', 'high', 'medium', 'low')")
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('full_name', sa.String(), nullable=True),
        sa.Column('hashed_password', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('is_superuser', sa.Boolean(), default=False),
        sa.Column('role', postgresql.ENUM('admin', 'manager', 'analyst', 'viewer', name='user_role'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('email_verified', sa.Boolean(), default=False),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('company', sa.String(), nullable=True),
        sa.Column('timezone', sa.String(), default='UTC'),
        sa.Column('preferences', sa.JSON(), default={}),
        sa.Column('api_key', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)
    op.create_index('ix_users_api_key', 'users', ['api_key'], unique=True)
    
    # Create organizations table
    op.create_table(
        'organizations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('settings', sa.JSON(), default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_organizations_slug', 'organizations', ['slug'], unique=True)
    
    # Create organization_members table
    op.create_table(
        'organization_members',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organization_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('role', postgresql.ENUM('admin', 'manager', 'analyst', 'viewer', name='user_role'), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'user_id')
    )
    
    # Create campaigns table
    op.create_table(
        'campaigns',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organization_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('platform', postgresql.ENUM('GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS', name='platform_type'), nullable=False),
        sa.Column('external_id', sa.String(), nullable=True),
        sa.Column('status', postgresql.ENUM('draft', 'active', 'paused', 'completed', 'archived', name='campaign_status'), nullable=False),
        sa.Column('budget', sa.Float(), nullable=True),
        sa.Column('daily_budget', sa.Float(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('objective', sa.String(), nullable=True),
        sa.Column('target_audience', sa.JSON(), default={}),
        sa.Column('settings', sa.JSON(), default={}),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_campaigns_organization_id', 'campaigns', ['organization_id'])
    op.create_index('ix_campaigns_platform', 'campaigns', ['platform'])
    op.create_index('ix_campaigns_status', 'campaigns', ['status'])
    
    # Create metrics table
    op.create_table(
        'metrics',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('campaign_id', sa.String(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('impressions', sa.Integer(), default=0),
        sa.Column('clicks', sa.Integer(), default=0),
        sa.Column('conversions', sa.Integer(), default=0),
        sa.Column('spend', sa.Float(), default=0.0),
        sa.Column('revenue', sa.Float(), default=0.0),
        sa.Column('reach', sa.Integer(), default=0),
        sa.Column('frequency', sa.Float(), default=0.0),
        sa.Column('engagements', sa.Integer(), default=0),
        sa.Column('video_views', sa.Integer(), default=0),
        sa.Column('video_completions', sa.Integer(), default=0),
        sa.Column('leads', sa.Integer(), default=0),
        sa.Column('custom_metrics', sa.JSON(), default={}),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('campaign_id', 'date')
    )
    op.create_index('ix_metrics_campaign_id', 'metrics', ['campaign_id'])
    op.create_index('ix_metrics_date', 'metrics', ['date'])
    
    # Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('type', postgresql.ENUM('alert', 'warning', 'info', 'success', 'report', 'system', name='notification_type'), nullable=False),
        sa.Column('priority', postgresql.ENUM('critical', 'high', 'medium', 'low', name='notification_priority'), default='medium'),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.String(), nullable=False),
        sa.Column('data', sa.JSON(), nullable=True),
        sa.Column('channels', sa.JSON(), default=[]),
        sa.Column('delivered_channels', sa.JSON(), default=[]),
        sa.Column('failed_channels', sa.JSON(), default=[]),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('delivered_at', sa.DateTime(), nullable=True),
        sa.Column('read_at', sa.DateTime(), nullable=True),
        sa.Column('is_read', sa.Boolean(), default=False),
        sa.Column('is_archived', sa.Boolean(), default=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
    op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])
    
    # Create reports table
    op.create_table(
        'reports',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('organization_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('format', sa.String(), nullable=False),
        sa.Column('status', sa.String(), default='pending'),
        sa.Column('parameters', sa.JSON(), default={}),
        sa.Column('file_path', sa.String(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('download_url', sa.String(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('error', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_reports_user_id', 'reports', ['user_id'])
    op.create_index('ix_reports_organization_id', 'reports', ['organization_id'])
    
    # Create integrations table
    op.create_table(
        'integrations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('organization_id', sa.String(), nullable=False),
        sa.Column('platform', postgresql.ENUM('GOOGLE_ADS', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'TIKTOK_ADS', 'LINKEDIN_ADS', 'TWITTER_ADS', 'YOUTUBE_ADS', 'PINTEREST_ADS', 'SNAPCHAT_ADS', name='platform_type'), nullable=False),
        sa.Column('credentials', sa.JSON(), nullable=False),  # Encrypted in application
        sa.Column('settings', sa.JSON(), default={}),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('last_sync', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id', 'platform')
    )
    
    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('organization_id', sa.String(), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('resource_type', sa.String(), nullable=False),
        sa.Column('resource_id', sa.String(), nullable=True),
        sa.Column('details', sa.JSON(), default={}),
        sa.Column('ip_address', sa.String(), nullable=True),
        sa.Column('user_agent', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('ix_audit_logs_organization_id', 'audit_logs', ['organization_id'])
    op.create_index('ix_audit_logs_created_at', 'audit_logs', ['created_at'])


def downgrade():
    # Drop tables
    op.drop_table('audit_logs')
    op.drop_table('integrations')
    op.drop_table('reports')
    op.drop_table('notifications')
    op.drop_table('metrics')
    op.drop_table('campaigns')
    op.drop_table('organization_members')
    op.drop_table('organizations')
    op.drop_table('users')
    
    # Drop enum types
    op.execute('DROP TYPE IF EXISTS notification_priority')
    op.execute('DROP TYPE IF EXISTS notification_type')
    op.execute('DROP TYPE IF EXISTS platform_type')
    op.execute('DROP TYPE IF EXISTS campaign_status')
    op.execute('DROP TYPE IF EXISTS user_role')