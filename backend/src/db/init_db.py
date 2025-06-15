"""
Initialize database with default data
"""

from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.models.organization import Organization, OrganizationMember
import uuid
import logging

logger = logging.getLogger(__name__)


def init_db(db: Session) -> None:
    """Initialize database with default data"""
    
    # Create superuser
    superuser = db.query(User).filter(User.email == settings.FIRST_SUPERUSER).first()
    if not superuser:
        superuser = User(
            id=str(uuid.uuid4()),
            email=settings.FIRST_SUPERUSER,
            username=settings.FIRST_SUPERUSER.split("@")[0],
            full_name="Admin User",
            hashed_password=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
            is_active=True,
            is_superuser=True,
            role=UserRole.ADMIN,
            email_verified=True
        )
        db.add(superuser)
        db.commit()
        db.refresh(superuser)
        logger.info(f"Created superuser: {superuser.email}")
        
        # Create default organization
        org = Organization(
            id=str(uuid.uuid4()),
            name="Default Organization",
            slug="default",
            owner_id=superuser.id,
            is_active=True
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        
        # Add superuser as organization member
        member = OrganizationMember(
            id=str(uuid.uuid4()),
            organization_id=org.id,
            user_id=superuser.id,
            role=UserRole.ADMIN
        )
        db.add(member)
        db.commit()
        
        logger.info(f"Created default organization: {org.name}")
    else:
        logger.info("Superuser already exists")


def main() -> None:
    """Main function"""
    logger.info("Creating initial data")
    db = SessionLocal()
    init_db(db)
    logger.info("Initial data created")


if __name__ == "__main__":
    main()