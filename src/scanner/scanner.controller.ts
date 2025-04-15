import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ScannerService } from './scanner.service';

@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('jobs')
  async createScanJob(
    @Body()
    scanJobDto: {
      basePaths: string[];
      includeNodeModules?: boolean;
      includeGitFolders?: boolean;
    },
  ) {
    const scanJob = await this.scannerService.createScanJob(
      scanJobDto.basePaths,
      {
        includeNodeModules: scanJobDto.includeNodeModules,
        includeGitFolders: scanJobDto.includeGitFolders,
      },
    );

    // Start scanning in the background
    this.scannerService.executeScanJob(scanJob.id).catch((error) => {
      console.error('Error executing scan job:', error);
    });

    return scanJob;
  }

  @Get('jobs')
  async getScanJobs(
    @Query('status') status?: 'pending' | 'active' | 'completed' | 'failed',
  ) {
    return await this.scannerService.getScanJobs(status);
  }

  @Get('jobs/:id')
  async getScanJob(@Param('id') id: string) {
    return await this.scannerService.getScanJobById(id);
  }

  @Get('results')
  async getScanResults(@Query('jobId') jobId?: string) {
    return await this.scannerService.getScanResults(jobId);
  }
}
