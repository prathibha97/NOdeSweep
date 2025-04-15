import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { CreateCleanupJobDto } from './dto/cleanup.dto';

@Controller('cleanup')
export class CleanupController {
  constructor(private readonly cleanupService: CleanupService) {}

  @Post('jobs')
  async createCleanupJob(@Body() createCleanupJobDto: CreateCleanupJobDto) {
    const job = await this.cleanupService.createCleanupJob(createCleanupJobDto);

    // Start cleaning in the background
    this.cleanupService.executeCleanupJob(job.id).catch((error) => {
      console.error('Error executing cleanup job:', error);
    });

    return job;
  }

  @Get('jobs')
  async getCleanupJobs() {
    return await this.cleanupService.findAll();
  }

  @Get('jobs/:id')
  async getCleanupJob(@Param('id') id: string) {
    return await this.cleanupService.findOne(id);
  }
}
