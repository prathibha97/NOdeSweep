import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { AnalysisService } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('projects/:id')
  async analyzeProject(@Param('id') id: string) {
    try {
      return await this.analysisService.analyzeProject(id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Failed to analyze project: ${error.message}`);
    }
  }

  @Get('projects/:id')
  async getProjectAnalysis(@Param('id') id: string) {
    return await this.analysisService.getAnalysisByProjectId(id);
  }

  @Get()
  async getAllAnalyses() {
    return await this.analysisService.getAllAnalyses();
  }
}
