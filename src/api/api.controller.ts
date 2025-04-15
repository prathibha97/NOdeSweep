import { Controller, Get } from '@nestjs/common';
import { ApiService } from './api.service';

@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get('dashboard')
  async getDashboardStats() {
    return this.apiService.getDashboardStats();
  }

  @Get('top-heaviest-projects')
  async getTopHeaviestProjects() {
    return this.apiService.getTopHeaviestProjects();
  }

  @Get('common-duplicated-dependencies')
  async getCommonDuplicatedDependencies() {
    return this.apiService.getCommonDuplicatedDependencies();
  }
}
