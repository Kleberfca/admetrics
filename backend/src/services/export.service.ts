import { prisma } from '../config/database';
import { parse } from 'json2csv';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { logger } from '../utils/logger';
import { format } from 'date-fns';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ExportOptions {
  userId: string;
  campaignIds: string[];
  startDate: Date;
  endDate: Date;
  format: 'csv' | 'excel' | 'json' | 'pdf';
  metrics?: string[];
  groupBy?: string;
  includeCharts?: boolean;
}

interface ExportResult {
  filename: string;
  filepath: string;
  format: string;
  size: number;
  url: string;
}

export class ExportService {
  private exportDir: string;

  constructor() {
    this.exportDir = path.join(process.cwd(), 'exports');
    this.ensureExportDir();
  }

  /**
   * Ensure export directory exists
   */
  private async ensureExportDir(): Promise<void> {
    try {
      await fs.mkdir(this.exportDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create export directory', error);
    }
  }

  /**
   * Export metrics data
   */
  async exportMetrics(options: ExportOptions): Promise<Buffer> {
    try {
      // Fetch data
      const data = await this.fetchMetricsData(options);

      // Export based on format
      switch (options.format) {
        case 'csv':
          return await this.exportToCSV(data);
        case 'excel':
          return await this.exportToExcel(data, options);
        case 'json':
          return this.exportToJSON(data);
        case 'pdf':
          return await this.exportToPDF(data, options);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      logger.error('Export failed', { error, options });
      throw error;
    }
  }

  /**
   * Fetch metrics data
   */
  private async fetchMetricsData(options: ExportOptions): Promise<any[]> {
    const { userId, campaignIds, startDate, endDate } = options;

    // Verify campaign ownership
    const campaigns = await prisma.campaign.findMany({
      where: {
        id: { in: campaignIds },
        userId,
        deletedAt: null
      },
      include: {
        integration: {
          select: {
            platform: true,
            name: true
          }
        }
      }
    });

    const validCampaignIds = campaigns.map(c => c.id);

    // Fetch metrics
    const metrics = await prisma.metric.findMany({
      where: {
        campaignId: { in: validCampaignIds },
        date: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        campaign: {
          select: {
            name: true,
            platform: true,
            status: true
          }
        }
      },
      orderBy: [
        { campaignId: 'asc' },
        { date: 'asc' }
      ]
    });

    // Transform data
    return metrics.map(metric => ({
      date: format(metric.date, 'yyyy-MM-dd'),
      campaignName: metric.campaign.name,
      platform: metric.campaign.platform,
      status: metric.campaign.status,
      impressions: metric.impressions,
      clicks: metric.clicks,
      spend: metric.spend,
      conversions: metric.conversions,
      ctr: metric.ctr,
      cpc: metric.cpc,
      cpm: metric.cpm,
      cpa: metric.cpa,
      roas: metric.roas,
      conversionRate: metric.conversionRate
    }));
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(data: any[]): Promise<Buffer> {
    const fields = [
      'date',
      'campaignName',
      'platform',
      'status',
      'impressions',
      'clicks',
      'spend',
      'conversions',
      'ctr',
      'cpc',
      'cpm',
      'cpa',
      'roas',
      'conversionRate'
    ];

    const csv = parse(data, {
      fields,
      header: true
    });

    return Buffer.from(csv);
  }

  /**
   * Export to Excel
   */
  private async exportToExcel(data: any[], options: ExportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    
    // Set properties
    workbook.creator = 'AdMetrics AI';
    workbook.created = new Date();
    
    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    this.addSummarySheet(summarySheet, data, options);

    // Add metrics sheet
    const metricsSheet = workbook.addWorksheet('Metrics');
    this.addMetricsSheet(metricsSheet, data);

    // Add charts if requested
    if (options.includeCharts) {
      const chartsSheet = workbook.addWorksheet('Charts');
      this.addChartsSheet(chartsSheet, data);
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as Buffer;
  }

  /**
   * Add summary sheet to Excel
   */
  private addSummarySheet(sheet: ExcelJS.Worksheet, data: any[], options: ExportOptions): void {
    // Title
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'AdMetrics Campaign Performance Report';
    sheet.getCell('A1').font = { size: 16, bold: true };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    // Date range
    sheet.getCell('A3').value = 'Report Period:';
    sheet.getCell('B3').value = `${format(options.startDate, 'MMM dd, yyyy')} - ${format(options.endDate, 'MMM dd, yyyy')}`;

    // Summary metrics
    const totalSpend = data.reduce((sum, row) => sum + row.spend, 0);
    const totalClicks = data.reduce((sum, row) => sum + row.clicks, 0);
    const totalConversions = data.reduce((sum, row) => sum + row.conversions, 0);
    const avgRoas = totalSpend > 0 ? (totalConversions * 100) / totalSpend : 0;

    sheet.getCell('A5').value = 'Total Spend:';
    sheet.getCell('B5').value = totalSpend;
    sheet.getCell('B5').numFmt = '$#,##0.00';

    sheet.getCell('A6').value = 'Total Clicks:';
    sheet.getCell('B6').value = totalClicks;
    sheet.getCell('B6').numFmt = '#,##0';

    sheet.getCell('A7').value = 'Total Conversions:';
    sheet.getCell('B7').value = totalConversions;
    sheet.getCell('B7').numFmt = '#,##0';

    sheet.getCell('A8').value = 'Average ROAS:';
    sheet.getCell('B8').value = avgRoas;
    sheet.getCell('B8').numFmt = '0.00';

    // Platform breakdown
    sheet.getCell('A10').value = 'Platform Breakdown';
    sheet.getCell('A10').font = { bold: true };

    const platformData = this.aggregateByPlatform(data);
    let row = 11;
    
    sheet.getCell(`A${row}`).value = 'Platform';
    sheet.getCell(`B${row}`).value = 'Spend';
    sheet.getCell(`C${row}`).value = 'Clicks';
    sheet.getCell(`D${row}`).value = 'Conversions';
    sheet.getCell(`E${row}`).value = 'ROAS';
    
    row++;
    Object.entries(platformData).forEach(([platform, metrics]) => {
      sheet.getCell(`A${row}`).value = platform;
      sheet.getCell(`B${row}`).value = metrics.spend;
      sheet.getCell(`B${row}`).numFmt = '$#,##0.00';
      sheet.getCell(`C${row}`).value = metrics.clicks;
      sheet.getCell(`C${row}`).numFmt = '#,##0';
      sheet.getCell(`D${row}`).value = metrics.conversions;
      sheet.getCell(`D${row}`).numFmt = '#,##0';
      sheet.getCell(`E${row}`).value = metrics.roas;
      sheet.getCell(`E${row}`).numFmt = '0.00';
      row++;
    });

    // Format columns
    sheet.columns = [
      { width: 20 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];
  }

  /**
   * Add metrics sheet to Excel
   */
  private addMetricsSheet(sheet: ExcelJS.Worksheet, data: any[]): void {
    // Headers
    const headers = [
      'Date',
      'Campaign',
      'Platform',
      'Status',
      'Impressions',
      'Clicks',
      'Spend',
      'Conversions',
      'CTR',
      'CPC',
      'CPM',
      'CPA',
      'ROAS',
      'Conv. Rate'
    ];

    sheet.addRow(headers);
    
    // Style headers
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    data.forEach(row => {
      sheet.addRow([
        row.date,
        row.campaignName,
        row.platform,
        row.status,
        row.impressions,
        row.clicks,
        row.spend,
        row.conversions,
        row.ctr,
        row.cpc,
        row.cpm,
        row.cpa,
        row.roas,
        row.conversionRate
      ]);
    });

    // Format columns
    sheet.getColumn(7).numFmt = '$#,##0.00'; // Spend
    sheet.getColumn(9).numFmt = '0.00%'; // CTR
    sheet.getColumn(10).numFmt = '$#,##0.00'; // CPC
    sheet.getColumn(11).numFmt = '$#,##0.00'; // CPM
    sheet.getColumn(12).numFmt = '$#,##0.00'; // CPA
    sheet.getColumn(13).numFmt = '0.00'; // ROAS
    sheet.getColumn(14).numFmt = '0.00%'; // Conv Rate

    // Auto-fit columns
    sheet.columns.forEach(column => {
      column.width = 15;
    });

    // Add filters
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: data.length + 1, column: headers.length }
    };
  }

  /**
   * Add charts sheet to Excel
   */
  private addChartsSheet(sheet: ExcelJS.Worksheet, data: any[]): void {
    // This would require additional charting library integration
    // For now, add a placeholder
    sheet.getCell('A1').value = 'Charts can be generated in the dashboard for interactive visualization';
  }

  /**
   * Export to JSON
   */
  private exportToJSON(data: any[]): Buffer {
    return Buffer.from(JSON.stringify(data, null, 2));
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(data: any[], options: ExportOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument();

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(20).text('AdMetrics Campaign Performance Report', {
        align: 'center'
      });

      doc.moveDown();

      // Date range
      doc.fontSize(12).text(
        `Report Period: ${format(options.startDate, 'MMM dd, yyyy')} - ${format(options.endDate, 'MMM dd, yyyy')}`,
        { align: 'center' }
      );

      doc.moveDown(2);

      // Summary metrics
      const totalSpend = data.reduce((sum, row) => sum + row.spend, 0);
      const totalClicks = data.reduce((sum, row) => sum + row.clicks, 0);
      const totalConversions = data.reduce((sum, row) => sum + row.conversions, 0);

      doc.fontSize(14).text('Summary Metrics', { underline: true });
      doc.fontSize(12);
      doc.text(`Total Spend: $${totalSpend.toFixed(2)}`);
      doc.text(`Total Clicks: ${totalClicks.toLocaleString()}`);
      doc.text(`Total Conversions: ${totalConversions.toLocaleString()}`);

      doc.moveDown(2);

      // Add table data (simplified)
      doc.fontSize(14).text('Campaign Performance', { underline: true });
      doc.fontSize(10);

      // Add simplified table
      data.slice(0, 50).forEach((row) => {
        doc.text(
          `${row.date} | ${row.campaignName} | $${row.spend.toFixed(2)} | ${row.conversions} conversions`
        );
      });

      if (data.length > 50) {
        doc.text(`... and ${data.length - 50} more records`);
      }

      doc.end();
    });
  }

  /**
   * Aggregate data by platform
   */
  private aggregateByPlatform(data: any[]): Record<string, any> {
    const platformData: Record<string, any> = {};

    data.forEach(row => {
      if (!platformData[row.platform]) {
        platformData[row.platform] = {
          spend: 0,
          clicks: 0,
          conversions: 0,
          impressions: 0
        };
      }

      platformData[row.platform].spend += row.spend;
      platformData[row.platform].clicks += row.clicks;
      platformData[row.platform].conversions += row.conversions;
      platformData[row.platform].impressions += row.impressions;
    });

    // Calculate ROAS
    Object.keys(platformData).forEach(platform => {
      const data = platformData[platform];
      data.roas = data.spend > 0 ? (data.conversions * 100) / data.spend : 0;
    });

    return platformData;
  }

  /**
   * Create export record
   */
  async createExportRecord(
    userId: string,
    filename: string,
    format: string,
    size: number
  ): Promise<ExportResult> {
    const exportId = uuidv4();
    const filepath = path.join(this.exportDir, `${exportId}-${filename}`);
    const url = `/api/exports/download/${exportId}`;

    // Save export record to database
    await prisma.exportRecord.create({
      data: {
        id: exportId,
        userId,
        filename,
        filepath,
        format,
        size,
        url,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    return {
      filename,
      filepath,
      format,
      size,
      url
    };
  }

  /**
   * Clean up old exports
   */
  async cleanupOldExports(): Promise<void> {
    try {
      // Find expired exports
      const expiredExports = await prisma.exportRecord.findMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      // Delete files and records
      for (const exportRecord of expiredExports) {
        try {
          await fs.unlink(exportRecord.filepath);
        } catch (error) {
          logger.warn('Failed to delete export file', {
            filepath: exportRecord.filepath,
            error
          });
        }
      }

      // Delete records
      await prisma.exportRecord.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      logger.info(`Cleaned up ${expiredExports.length} expired exports`);
    } catch (error) {
      logger.error('Export cleanup failed', error);
    }
  }
}