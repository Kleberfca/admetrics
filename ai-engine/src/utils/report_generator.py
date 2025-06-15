#!/usr/bin/env python3
"""
Report generation utilities for AdMetrics
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union
import logging
from datetime import datetime, timedelta
import json
import base64
from io import BytesIO
import matplotlib.pyplot as plt
import seaborn as sns
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import xlsxwriter

logger = logging.getLogger(__name__)


class ReportGenerator:
    """Generate reports in various formats"""
    
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
        
    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        self.styles.add(ParagraphStyle(
            name='CustomTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a73e8'),
            spaceAfter=30
        ))
        
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#1a73e8'),
            spaceAfter=12
        ))
    
    def generate_campaign_report(self, campaign_data: pd.DataFrame,
                               metrics_data: pd.DataFrame,
                               insights: Dict[str, Any],
                               format: str = 'pdf') -> Union[bytes, str]:
        """Generate comprehensive campaign report"""
        try:
            if format == 'pdf':
                return self._generate_pdf_report(campaign_data, metrics_data, insights)
            elif format == 'excel':
                return self._generate_excel_report(campaign_data, metrics_data, insights)
            elif format == 'json':
                return self._generate_json_report(campaign_data, metrics_data, insights)
            else:
                raise ValueError(f"Unsupported format: {format}")
                
        except Exception as e:
            logger.error(f"Error generating report: {e}")
            raise
    
    def _generate_pdf_report(self, campaign_data: pd.DataFrame,
                           metrics_data: pd.DataFrame,
                           insights: Dict[str, Any]) -> bytes:
        """Generate PDF report"""
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        story = []
        
        # Title
        story.append(Paragraph("Campaign Performance Report", self.styles['CustomTitle']))
        story.append(Spacer(1, 12))
        
        # Executive Summary
        story.append(Paragraph("Executive Summary", self.styles['SectionHeader']))
        summary = self._create_executive_summary(campaign_data, metrics_data)
        for key, value in summary.items():
            story.append(Paragraph(f"<b>{key}:</b> {value}", self.styles['Normal']))
        story.append(Spacer(1, 12))
        
        # Performance Overview Chart
        overview_chart = self._create_performance_overview_chart(metrics_data)
        if overview_chart:
            story.append(Image(overview_chart, width=6*inch, height=4*inch))
            story.append(Spacer(1, 12))
        
        # Campaign Performance Table
        story.append(Paragraph("Campaign Performance", self.styles['SectionHeader']))
        campaign_table = self._create_campaign_table(campaign_data)
        story.append(campaign_table)
        story.append(Spacer(1, 12))
        
        # Insights Section
        if insights:
            story.append(Paragraph("Key Insights", self.styles['SectionHeader']))
            for insight in insights.get('recommendations', []):
                story.append(Paragraph(f"• {insight}", self.styles['Normal']))
            story.append(Spacer(1, 12))
        
        # Platform Breakdown
        story.append(PageBreak())
        story.append(Paragraph("Platform Breakdown", self.styles['SectionHeader']))
        platform_charts = self._create_platform_charts(metrics_data)
        for chart in platform_charts:
            story.append(Image(chart, width=5*inch, height=3*inch))
            story.append(Spacer(1, 6))
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer.getvalue()
    
    def _generate_excel_report(self, campaign_data: pd.DataFrame,
                             metrics_data: pd.DataFrame,
                             insights: Dict[str, Any]) -> bytes:
        """Generate Excel report"""
        buffer = BytesIO()
        
        with pd.ExcelWriter(buffer, engine='xlsxwriter') as writer:
            workbook = writer.book
            
            # Define formats
            header_format = workbook.add_format({
                'bold': True,
                'bg_color': '#1a73e8',
                'font_color': 'white',
                'border': 1
            })
            
            number_format = workbook.add_format({'num_format': '#,##0'})
            currency_format = workbook.add_format({'num_format': '$#,##0.00'})
            percent_format = workbook.add_format({'num_format': '0.00%'})
            
            # Summary Sheet
            summary_df = pd.DataFrame([self._create_executive_summary(campaign_data, metrics_data)])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            # Format summary sheet
            summary_sheet = writer.sheets['Summary']
            for col_num, col_name in enumerate(summary_df.columns):
                summary_sheet.write(0, col_num, col_name, header_format)
                summary_sheet.set_column(col_num, col_num, 20)
            
            # Campaign Performance Sheet
            campaign_data.to_excel(writer, sheet_name='Campaign Performance', index=False)
            self._format_excel_sheet(writer.sheets['Campaign Performance'], 
                                   campaign_data, header_format,
                                   number_format, currency_format, percent_format)
            
            # Metrics Sheet
            metrics_data.to_excel(writer, sheet_name='Daily Metrics', index=False)
            self._format_excel_sheet(writer.sheets['Daily Metrics'], 
                                   metrics_data, header_format,
                                   number_format, currency_format, percent_format)
            
            # Insights Sheet
            insights_data = []
            for category, items in insights.items():
                if isinstance(items, list):
                    for item in items:
                        insights_data.append({
                            'Category': category,
                            'Insight': item
                        })
            
            if insights_data:
                insights_df = pd.DataFrame(insights_data)
                insights_df.to_excel(writer, sheet_name='Insights', index=False)
                
                insights_sheet = writer.sheets['Insights']
                for col_num, col_name in enumerate(insights_df.columns):
                    insights_sheet.write(0, col_num, col_name, header_format)
                    insights_sheet.set_column(col_num, col_num, 50 if col_num == 1 else 20)
            
            # Add charts
            self._add_excel_charts(workbook, writer.sheets, metrics_data)
        
        buffer.seek(0)
        return buffer.getvalue()
    
    def _generate_json_report(self, campaign_data: pd.DataFrame,
                            metrics_data: pd.DataFrame,
                            insights: Dict[str, Any]) -> str:
        """Generate JSON report"""
        report = {
            'generated_at': datetime.now().isoformat(),
            'summary': self._create_executive_summary(campaign_data, metrics_data),
            'campaigns': campaign_data.to_dict('records'),
            'daily_metrics': metrics_data.to_dict('records'),
            'insights': insights,
            'platform_breakdown': self._calculate_platform_breakdown(metrics_data),
            'time_series': self._prepare_time_series_data(metrics_data)
        }
        
        return json.dumps(report, indent=2, default=str)
    
    def _create_executive_summary(self, campaign_data: pd.DataFrame,
                                metrics_data: pd.DataFrame) -> Dict[str, Any]:
        """Create executive summary"""
        summary = {
            'Report Period': f"{metrics_data['date'].min()} to {metrics_data['date'].max()}",
            'Total Campaigns': len(campaign_data),
            'Active Campaigns': len(campaign_data[campaign_data['status'] == 'ACTIVE']),
            'Total Spend': f"${metrics_data['spend'].sum():,.2f}",
            'Total Conversions': f"{metrics_data['conversions'].sum():,.0f}",
            'Overall ROAS': f"{metrics_data['revenue'].sum() / metrics_data['spend'].sum():.2f}x" if metrics_data['spend'].sum() > 0 else "N/A",
            'Average CTR': f"{metrics_data['ctr'].mean():.2%}" if 'ctr' in metrics_data else "N/A",
            'Average CPA': f"${metrics_data['spend'].sum() / metrics_data['conversions'].sum():.2f}" if metrics_data['conversions'].sum() > 0 else "N/A"
        }
        
        return summary
    
    def _create_performance_overview_chart(self, metrics_data: pd.DataFrame) -> Optional[BytesIO]:
        """Create performance overview chart"""
        try:
            fig, axes = plt.subplots(2, 2, figsize=(12, 8))
            fig.suptitle('Performance Overview', fontsize=16)
            
            # Daily spend trend
            daily_spend = metrics_data.groupby('date')['spend'].sum()
            axes[0, 0].plot(daily_spend.index, daily_spend.values, color='#1a73e8')
            axes[0, 0].set_title('Daily Spend')
            axes[0, 0].set_xlabel('Date')
            axes[0, 0].set_ylabel('Spend ($)')
            
            # Daily conversions trend
            daily_conversions = metrics_data.groupby('date')['conversions'].sum()
            axes[0, 1].plot(daily_conversions.index, daily_conversions.values, color='#34a853')
            axes[0, 1].set_title('Daily Conversions')
            axes[0, 1].set_xlabel('Date')
            axes[0, 1].set_ylabel('Conversions')
            
            # CTR trend
            if 'ctr' in metrics_data:
                daily_ctr = metrics_data.groupby('date')['ctr'].mean()
                axes[1, 0].plot(daily_ctr.index, daily_ctr.values, color='#fbbc04')
                axes[1, 0].set_title('Average CTR')
                axes[1, 0].set_xlabel('Date')
                axes[1, 0].set_ylabel('CTR (%)')
            
            # ROAS trend
            daily_metrics = metrics_data.groupby('date').agg({
                'revenue': 'sum',
                'spend': 'sum'
            })
            daily_metrics['roas'] = daily_metrics['revenue'] / daily_metrics['spend']
            axes[1, 1].plot(daily_metrics.index, daily_metrics['roas'], color='#ea4335')
            axes[1, 1].set_title('Daily ROAS')
            axes[1, 1].set_xlabel('Date')
            axes[1, 1].set_ylabel('ROAS')
            
            plt.tight_layout()
            
            # Save to buffer
            buffer = BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            plt.close()
            
            return buffer
            
        except Exception as e:
            logger.error(f"Error creating overview chart: {e}")
            return None
    
    def _create_campaign_table(self, campaign_data: pd.DataFrame) -> Table:
        """Create campaign performance table for PDF"""
        # Select key columns
        columns = ['campaign_name', 'platform', 'status', 'spend', 'conversions', 'roas', 'ctr']
        available_columns = [col for col in columns if col in campaign_data.columns]
        
        # Prepare data
        table_data = [available_columns]  # Header row
        
        for _, row in campaign_data.iterrows():
            row_data = []
            for col in available_columns:
                value = row[col]
                if col == 'spend':
                    row_data.append(f"${value:,.2f}")
                elif col == 'ctr' or col == 'roas':
                    row_data.append(f"{value:.2f}")
                else:
                    row_data.append(str(value))
            table_data.append(row_data)
        
        # Create table
        table = Table(table_data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a73e8')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        return table
    
    def _create_platform_charts(self, metrics_data: pd.DataFrame) -> List[BytesIO]:
        """Create platform breakdown charts"""
        charts = []
        
        try:
            # Platform spend distribution
            platform_spend = metrics_data.groupby('platform')['spend'].sum()
            
            fig, ax = plt.subplots(figsize=(8, 6))
            platform_spend.plot(kind='pie', autopct='%1.1f%%', ax=ax)
            ax.set_title('Spend Distribution by Platform')
            ax.set_ylabel('')
            
            buffer = BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            charts.append(buffer)
            plt.close()
            
            # Platform performance comparison
            platform_metrics = metrics_data.groupby('platform').agg({
                'conversions': 'sum',
                'spend': 'sum',
                'clicks': 'sum'
            })
            platform_metrics['cpa'] = platform_metrics['spend'] / platform_metrics['conversions']
            
            fig, ax = plt.subplots(figsize=(10, 6))
            platform_metrics['cpa'].plot(kind='bar', ax=ax, color='#1a73e8')
            ax.set_title('Cost Per Acquisition by Platform')
            ax.set_xlabel('Platform')
            ax.set_ylabel('CPA ($)')
            plt.xticks(rotation=45)
            
            buffer = BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            charts.append(buffer)
            plt.close()
            
        except Exception as e:
            logger.error(f"Error creating platform charts: {e}")
        
        return charts
    
    def _format_excel_sheet(self, worksheet, dataframe: pd.DataFrame,
                          header_format, number_format, 
                          currency_format, percent_format):
        """Format Excel worksheet"""
        # Write headers with formatting
        for col_num, col_name in enumerate(dataframe.columns):
            worksheet.write(0, col_num, col_name, header_format)
            
            # Set column width
            max_width = max(
                len(str(col_name)),
                dataframe[col_name].astype(str).map(len).max()
            )
            worksheet.set_column(col_num, col_num, min(max_width + 2, 30))
            
            # Apply number formats
            if col_name in ['impressions', 'clicks', 'conversions']:
                worksheet.set_column(col_num, col_num, 15, number_format)
            elif col_name in ['spend', 'revenue', 'cpc', 'cpa']:
                worksheet.set_column(col_num, col_num, 15, currency_format)
            elif col_name in ['ctr', 'cvr', 'roas']:
                worksheet.set_column(col_num, col_num, 15, percent_format)
    
    def _add_excel_charts(self, workbook, sheets, metrics_data: pd.DataFrame):
        """Add charts to Excel workbook"""
        chart_sheet = workbook.add_worksheet('Charts')
        
        # Spend trend chart
        chart1 = workbook.add_chart({'type': 'line'})
        chart1.add_series({
            'name': 'Daily Spend',
            'categories': ['Daily Metrics', 1, 0, len(metrics_data), 0],
            'values': ['Daily Metrics', 1, 3, len(metrics_data), 3],
        })
        chart1.set_title({'name': 'Daily Spend Trend'})
        chart1.set_x_axis({'name': 'Date'})
        chart1.set_y_axis({'name': 'Spend ($)'})
        chart_sheet.insert_chart('A1', chart1)
        
        # Conversions trend chart
        chart2 = workbook.add_chart({'type': 'column'})
        chart2.add_series({
            'name': 'Daily Conversions',
            'categories': ['Daily Metrics', 1, 0, len(metrics_data), 0],
            'values': ['Daily Metrics', 1, 4, len(metrics_data), 4],
        })
        chart2.set_title({'name': 'Daily Conversions'})
        chart2.set_x_axis({'name': 'Date'})
        chart2.set_y_axis({'name': 'Conversions'})
        chart_sheet.insert_chart('A18', chart2)
    
    def _calculate_platform_breakdown(self, metrics_data: pd.DataFrame) -> Dict[str, Any]:
        """Calculate platform breakdown metrics"""
        if 'platform' not in metrics_data.columns:
            return {}
        
        breakdown = {}
        
        for platform in metrics_data['platform'].unique():
            platform_data = metrics_data[metrics_data['platform'] == platform]
            
            breakdown[platform] = {
                'total_spend': float(platform_data['spend'].sum()),
                'total_conversions': int(platform_data['conversions'].sum()),
                'total_revenue': float(platform_data.get('revenue', 0).sum()),
                'avg_ctr': float(platform_data.get('ctr', 0).mean()),
                'avg_cpc': float(platform_data['spend'].sum() / platform_data['clicks'].sum()) 
                           if platform_data['clicks'].sum() > 0 else 0,
                'roas': float(platform_data.get('revenue', 0).sum() / platform_data['spend'].sum()) 
                        if platform_data['spend'].sum() > 0 else 0
            }
        
        return breakdown
    
    def _prepare_time_series_data(self, metrics_data: pd.DataFrame) -> Dict[str, List]:
        """Prepare time series data for JSON export"""
        time_series = {}
        
        # Group by date
        daily_data = metrics_data.groupby('date').agg({
            'impressions': 'sum',
            'clicks': 'sum',
            'conversions': 'sum',
            'spend': 'sum',
            'revenue': 'sum'
        }).reset_index()
        
        # Convert to lists for JSON
        time_series['dates'] = daily_data['date'].astype(str).tolist()
        time_series['impressions'] = daily_data['impressions'].tolist()
        time_series['clicks'] = daily_data['clicks'].tolist()
        time_series['conversions'] = daily_data['conversions'].tolist()
        time_series['spend'] = daily_data['spend'].round(2).tolist()
        time_series['revenue'] = daily_data['revenue'].round(2).tolist()
        
        return time_series