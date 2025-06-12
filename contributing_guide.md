# Contributing to AdMetrics AI Dashboard

Thank you for your interest in contributing to AdMetrics AI Dashboard! We welcome contributions from the community and are grateful for every bug report, feature request, and code contribution.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Process](#contributing-process)
- [Code Standards](#code-standards)
- [Testing Guidelines](#testing-guidelines)
- [Documentation](#documentation)
- [Community Guidelines](#community-guidelines)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [conduct@admetrics.ai](mailto:conduct@admetrics.ai).

## Getting Started

### Types of Contributions

We welcome several types of contributions:

- 🐛 **Bug reports**: Report issues you encounter
- 💡 **Feature requests**: Suggest new features or improvements
- 📝 **Documentation**: Improve or add documentation
- 🔧 **Code contributions**: Bug fixes, features, and improvements
- 🎨 **Design**: UI/UX improvements and design suggestions
- 🧪 **Testing**: Add or improve test coverage
- 🌐 **Translations**: Help localize the application

### Before Contributing

1. **Search existing issues** to avoid duplicates
2. **Check the roadmap** to see planned features
3. **Discuss major changes** in an issue before implementing
4. **Follow our coding standards** outlined below

## Development Setup

### Prerequisites

- Node.js 18.0+ and npm 8.0+
- Python 3.9+ with pip
- Docker 20.10+ and Docker Compose
- Git 2.0+

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/your-org/admetrics-ai-dashboard.git
cd admetrics-ai-dashboard

# Run the setup script
chmod +x setup.sh
./setup.sh

# Start development environment
docker-compose up -d
```

### Manual Setup

```bash
# Install backend dependencies
cd backend
npm install
npx prisma generate
npx prisma migrate dev

# Install frontend dependencies
cd ../frontend
npm install

# Install AI engine dependencies
cd ../ai-engine
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start services
npm run dev  # In backend directory
npm start    # In frontend directory
python src/api/app.py  # In ai-engine directory (with venv activated)
```

## Contributing Process

### 1. Fork and Clone

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/your-username/admetrics-ai-dashboard.git
cd admetrics-ai-dashboard

# Add upstream remote
git remote add upstream https://github.com/your-org/admetrics-ai-dashboard.git
```

### 2. Create a Feature Branch

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b bugfix/issue-number-description
```

### Branch Naming Convention

- `feature/feature-name` - New features
- `bugfix/issue-number-description` - Bug fixes
- `docs/documentation-update` - Documentation updates
- `refactor/component-name` - Code refactoring
- `test/test-description` - Test improvements
- `chore/maintenance-task` - Maintenance tasks

### 3. Make Your Changes

#### Code Guidelines

- Follow the existing code style and patterns
- Write meaningful commit messages
- Add tests for new functionality
- Update documentation as needed
- Ensure all tests pass

#### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(dashboard): add real-time metrics display
fix(auth): resolve token expiration handling
docs(api): update authentication documentation
test(metrics): add unit tests for metrics service
```

### 4. Test Your Changes

```bash
# Run all tests
npm run test

# Run specific test suites
npm run test:backend
npm run test:frontend
npm run test:ai

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### 5. Submit a Pull Request

1. **Push your branch** to your fork
2. **Create a pull request** on GitHub
3. **Fill out the PR template** completely
4. **Link related issues** using keywords (fixes #123)
5. **Wait for review** and respond to feedback

#### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Related Issues
Fixes #(issue number)

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots to help explain your changes.

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
```

## Code Standards

### TypeScript/JavaScript

- **ESLint**: Use the provided ESLint configuration
- **Prettier**: Format code using Prettier
- **TypeScript**: Use strict mode and proper typing
- **Naming**: Use camelCase for variables and functions, PascalCase for classes and components

```typescript
// Good
const getUserData = async (userId: string): Promise<UserData> => {
  // Implementation
};

// Bad
const get_user_data = async (user_id: any) => {
  // Implementation
};
```

### React Components

- Use functional components with hooks
- Props should have TypeScript interfaces
- Use meaningful component and prop names
- Follow the established file structure

```tsx
// Good
interface UserProfileProps {
  userId: string;
  onUserUpdate: (user: User) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ userId, onUserUpdate }) => {
  // Component implementation
};

export { UserProfile };
```

### Python

- Follow PEP 8 style guide
- Use type hints
- Write descriptive docstrings
- Use meaningful variable names

```python
# Good
def calculate_campaign_metrics(
    campaign_data: pd.DataFrame,
    date_range: DateRange
) -> Dict[str, float]:
    """
    Calculate aggregated metrics for campaign data.
    
    Args:
        campaign_data: DataFrame containing campaign metrics
        date_range: Date range for calculation
        
    Returns:
        Dictionary containing calculated metrics
    """
    # Implementation
```

### API Design

- Use RESTful conventions
- Provide clear error messages
- Include proper HTTP status codes
- Document all endpoints

```typescript
// Good
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await campaignService.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found',
        message: `Campaign with ID ${req.params.id} does not exist`
      });
    }
    res.json(campaign);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve campaign'
    });
  }
});
```

## Testing Guidelines

### Test Structure

```
tests/
├── unit/           # Unit tests for individual components/functions
├── integration/    # Integration tests for API endpoints
├── e2e/           # End-to-end tests
├── fixtures/      # Test data and mocks
└── utils/         # Test utilities and helpers
```

### Writing Tests

#### Backend Tests

```typescript
describe('CampaignService', () => {
  describe('createCampaign', () => {
    it('should create a campaign with valid data', async () => {
      // Arrange
      const campaignData = {
        name: 'Test Campaign',
        platform: 'GOOGLE_ADS',
        budget: 1000
      };

      // Act
      const result = await campaignService.createCampaign(campaignData);

      // Assert
      expect(result).toHaveProperty('id');
      expect(result.name).toBe('Test Campaign');
    });

    it('should throw error with invalid data', async () => {
      // Arrange
      const invalidData = { name: '' };

      // Act & Assert
      await expect(
        campaignService.createCampaign(invalidData)
      ).rejects.toThrow('Campaign name is required');
    });
  });
});
```

#### Frontend Tests

```tsx
describe('CampaignCard', () => {
  it('should render campaign information', () => {
    // Arrange
    const campaign = {
      id: '1',
      name: 'Test Campaign',
      platform: 'GOOGLE_ADS',
      status: 'ACTIVE'
    };

    // Act
    render(<CampaignCard campaign={campaign} />);

    // Assert
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText('GOOGLE_ADS')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });
});
```

#### AI/ML Tests

```python
class TestPerformancePredictor:
    def test_predict_campaign_performance(self):
        # Arrange
        predictor = PerformancePredictor()
        historical_data = create_sample_data()
        
        # Act
        predictions = predictor.predict(historical_data, days=30)
        
        # Assert
        assert 'spend' in predictions
        assert 'clicks' in predictions
        assert len(predictions['spend']) == 30
```

### Test Coverage

Maintain test coverage above:
- **Unit tests**: 90%+
- **Integration tests**: 80%+
- **E2E tests**: Critical user flows

## Documentation

### Code Documentation

- **Comments**: Explain complex logic and business rules
- **JSDoc/Docstrings**: Document all public APIs
- **README**: Keep component READMEs updated
- **API Documentation**: Use OpenAPI/Swagger for API docs

### Documentation Updates

When making changes, update:
- Code comments and documentation
- API documentation
- User guides (if UI changes)
- Architecture diagrams (if structure changes)

## Community Guidelines

### Communication

- **Be respectful** and professional
- **Be constructive** in feedback
- **Ask questions** if something is unclear
- **Help others** when you can

### Issue Reporting

When reporting bugs:

1. **Search existing issues** first
2. **Use the bug report template**
3. **Provide reproduction steps**
4. **Include environment details**
5. **Add relevant logs or screenshots**

### Feature Requests

When requesting features:

1. **Check the roadmap** first
2. **Use the feature request template**
3. **Explain the use case**
4. **Provide examples or mockups**
5. **Discuss implementation approach**

### Code Review

When reviewing code:

- **Be constructive** and specific
- **Explain the "why"** behind suggestions
- **Appreciate good work**
- **Focus on the code**, not the person
- **Suggest alternatives** when possible

When receiving reviews:

- **Be open** to feedback
- **Ask questions** if unclear
- **Respond promptly**
- **Thank reviewers** for their time

## Recognition

Contributors will be recognized in:
- Repository contributors list
- Release notes (for significant contributions)
- Project documentation
- Community highlights

## Getting Help

If you need help:

1. **Check the documentation** first
2. **Search existing issues** and discussions
3. **Ask in discussions** for general questions
4. **Create an issue** for bugs or specific problems
5. **Join our Discord** for real-time chat

### Contact

- 💬 **Discord**: [Join our community](https://discord.gg/admetrics)
- 🐛 **Issues**: [GitHub Issues](https://github.com/your-org/admetrics-ai-dashboard/issues)
- 💡 **Discussions**: [GitHub Discussions](https://github.com/your-org/admetrics-ai-dashboard/discussions)
- 📧 **Email**: [dev@admetrics.ai](mailto:dev@admetrics.ai)

## License

By contributing to AdMetrics AI Dashboard, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for contributing to AdMetrics AI Dashboard! Your help makes this project better for everyone. 🚀