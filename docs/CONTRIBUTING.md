# Contributing to AdMetrics

Thank you for your interest in contributing to AdMetrics! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Process](#development-process)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing viewpoints and experiences

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Python 3.11+
- Docker and Docker Compose
- Git

### Setting Up Your Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/admetrics.git
   cd admetrics

3. Add the upstream repository:
git remote add upstream https://github.com/admetrics/admetrics.git

4. Install dependencies:
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# AI Engine
cd ../ai-engine && pip install -r requirements.txt

5. Set up environment variables:
cp .env.example .env
# Edit .env with your local configuration

6. Start development environment:
docker-compose up -d

Development Process
We use GitHub Flow for our development process:

1. Create a new branch from main for your feature or fix
2. Make your changes in your branch
3. Write or update tests as needed
4. Update documentation as needed
5. Submit a pull request to the main branch

Branch Naming Convention

Feature branches: feature/your-feature-name
Bug fixes: fix/bug-description
Documentation: docs/what-you-updated
Refactoring: refactor/what-you-refactored

How to Contribute
Reporting Bugs
Before creating bug reports, please check existing issues to avoid duplicates.
When creating a bug report, include:

A clear and descriptive title
Steps to reproduce the issue
Expected behavior
Actual behavior
Screenshots (if applicable)
Environment details (OS, browser, versions)

Suggesting Enhancements
Enhancement suggestions are welcome! Please provide:

A clear and descriptive title
Detailed description of the proposed feature
Use cases and benefits
Possible implementation approach
Mock-ups or examples (if applicable)

Code Contributions
1. Find an Issue: Look for issues labeled good first issue or help wanted
2. Comment: Let us know you're working on it
3. Code: Implement your solution following our coding standards
4. Test: Ensure all tests pass and add new ones if needed
5. Document: Update documentation if necessary
6. Submit: Create a pull request

Coding Standards
TypeScript/JavaScript (Backend & Frontend)

Use TypeScript for all new code
Follow ESLint configuration
Use Prettier for formatting
Naming conventions:

PascalCase for components and classes
camelCase for functions and variables
UPPER_SNAKE_CASE for constants
kebab-case for file names

Example:
// Good
export class UserService {
  private readonly MAX_RETRIES = 3;
  
  async getUserById(userId: string): Promise<User> {
    // Implementation
  }
}

// File: user-service.ts

Python (AI Engine)

Follow PEP 8
Use type hints
Document functions with docstrings
Use meaningful variable names

Example:
def calculate_roas(spend: float, revenue: float) -> float:
    """
    Calculate Return on Ad Spend (ROAS)
    
    Args:
        spend: Total advertising spend
        revenue: Total revenue generated
        
    Returns:
        ROAS as a percentage
    """
    if spend == 0:
        return 0.0
    return (revenue / spend) * 100

Commit Messages
Follow the Conventional Commits specification:
<type>(<scope>): <subject>

<body>

<footer>

Types:

feat: New feature
fix: Bug fix
docs: Documentation changes
style: Code style changes (formatting, etc.)
refactor: Code refactoring
test: Adding or updating tests
chore: Maintenance tasks

Example:
feat(campaigns): add bulk campaign status update

- Implement bulk pause/resume functionality
- Add validation for campaign ownership
- Update API documentation

Closes #123

Testing
Backend Tests
cd backend
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:coverage      # Generate coverage report

Frontend Tests
cd frontend
npm test                   # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Generate coverage report

AI Engine Tests
cd ai-engine
pytest                     # Run all tests
pytest --cov              # With coverage
pytest -v                 # Verbose output

Writing Tests

Write tests for all new features
Maintain test coverage above 80%
Use descriptive test names
Follow AAA pattern (Arrange, Act, Assert)

Example:
describe('CampaignService', () => {
  describe('updateCampaignStatus', () => {
    it('should update campaign status to paused', async () => {
      // Arrange
      const campaignId = 'campaign_123';
      const newStatus = 'PAUSED';
      
      // Act
      const result = await campaignService.updateCampaignStatus(
        campaignId, 
        userId, 
        newStatus
      );
      
      // Assert
      expect(result.status).toBe('PAUSED');
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: campaignId },
        data: { status: newStatus }
      });
    });
  });
});

Documentation
Code Documentation

Add JSDoc/TSDoc comments for public APIs
Include examples in documentation
Keep documentation up to date with code changes

README Updates
Update README.md when:

Adding new features
Changing setup procedures
Modifying dependencies

API Documentation

Update OpenAPI/Swagger specs for API changes
Include request/response examples
Document error responses

Pull Request Process
1. Before Submitting:

Ensure all tests pass
Run linters and fix any issues
Update documentation
Rebase on latest main branch

2. Pull Request Template:
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings

3. Review Process:
At least one maintainer must review
All CI checks must pass
Address review feedback promptly
Squash commits before merging

Questions?
Feel free to:

Open an issue for questions
Join our Discord community
Email the maintainers at contribute@admetrics.ai

Thank you for contributing to AdMetrics! 🚀