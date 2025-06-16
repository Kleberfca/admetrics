import React from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Box, 
  Chip,
  Skeleton 
} from '@mui/material';
import { 
  TrendingUp, 
  TrendingDown, 
  TrendingFlat 
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  format?: 'currency' | 'number' | 'percentage';
  icon?: React.ReactNode;
  color?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  isLoading?: boolean;
}

const StyledCard = styled(Card)<{ color?: string }>(({ theme, color }) => ({
  height: '100%',
  position: 'relative',
  overflow: 'visible',
  transition: 'transform 0.2s, box-shadow 0.2s',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[8]
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: color ? theme.palette[color as keyof typeof theme.palette].main : theme.palette.primary.main,
    borderRadius: '4px 4px 0 0'
  }
}));

const IconWrapper = styled(Box)<{ color?: string }>(({ theme, color }) => ({
  width: 48,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  background: color 
    ? `${theme.palette[color as keyof typeof theme.palette].main}20`
    : `${theme.palette.primary.main}20`,
  color: color 
    ? theme.palette[color as keyof typeof theme.palette].main 
    : theme.palette.primary.main,
  '& svg': {
    fontSize: 24
  }
}));

export const DashboardMetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change = 0,
  format = 'number',
  icon,
  color = 'primary',
  isLoading = false
}) => {
  const getTrendIcon = () => {
    if (change > 0) return <TrendingUp fontSize="small" />;
    if (change < 0) return <TrendingDown fontSize="small" />;
    return <TrendingFlat fontSize="small" />;
  };

  const getTrendColor = () => {
    if (change > 0) return 'success';
    if (change < 0) return 'error';
    return 'default';
  };

  const formatChange = () => {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <StyledCard>
        <CardContent>
          <Skeleton variant="text" width="60%" height={24} />
          <Skeleton variant="text" width="80%" height={40} sx={{ my: 1 }} />
          <Skeleton variant="rectangular" width={80} height={24} />
        </CardContent>
      </StyledCard>
    );
  }

  return (
    <StyledCard color={color}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            {title}
          </Typography>
          {icon && <IconWrapper color={color}>{icon}</IconWrapper>}
        </Box>
        
        <Typography variant="h4" component="div" fontWeight={600} gutterBottom>
          {value}
        </Typography>
        
        <Chip
          icon={getTrendIcon()}
          label={formatChange()}
          size="small"
          color={getTrendColor() as any}
          variant="outlined"
        />
      </CardContent>
    </StyledCard>
  );
};