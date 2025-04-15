import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import { AnalysisService } from '../analysis/analysis.service';
import { CleanupService } from '../cleanup/cleanup.service';
import { ProjectsService } from '../projects/projects.service';
import { ScannerService } from '../scanner/scanner.service';

@Injectable()
export class ApiService {
  constructor(
    private scannerService: ScannerService,
    private projectsService: ProjectsService,
    private cleanupService: CleanupService,
    private analysisService: AnalysisService,
  ) {}

  async getDashboardStats() {
    // Get projects
    const projects = await this.projectsService.findAll();

    // Get recent scan jobs
    const recentScanJobs = await this.scannerService.getScanJobs();

    // Get recent cleanup jobs
    const recentCleanupJobs = await this.cleanupService.findAll();

    // Calculate stats
    const totalProjects = projects.length;
    const totalNodeModulesSize = projects.reduce(
      (sum, project) => sum + Number(project.nodeModulesSize),
      0,
    );
    const totalDependencies = projects.reduce(
      (sum, project) => sum + project.dependencyCount,
      0,
    );

    const spaceReclaimed = recentCleanupJobs
      .filter((job) => job.status === 'completed')
      .reduce((sum, job) => sum + Number(job.spaceReclaimed), 0);

    // Get system disk information
    const diskInfo = await this.getSystemDiskInfo();

    return {
      totalProjects,
      totalNodeModulesSize,
      totalDependencies,
      spaceReclaimed,
      recentScanJobs: recentScanJobs.slice(0, 5),
      recentCleanupJobs: recentCleanupJobs.slice(0, 5),
      diskInfo,
    };
  }

  async getSystemDiskInfo() {
    try {
      // This is a simplified approach - in a real app, we'd use a more robust
      // system-specific method for getting disk information

      // Get the system's home directory
      const homeDir = os.homedir();

      // Get disk information for the drive containing the home directory
      const stats = await fs.statfs(homeDir);

      // Calculate sizes in bytes
      const totalSize = stats.blocks * stats.bsize;
      const freeSize = stats.bfree * stats.bsize;
      const usedSize = totalSize - freeSize;

      return {
        totalSize,
        freeSize,
        usedSize,
        usedPercentage: (usedSize / totalSize) * 100,
        mountPoint: homeDir,
      };
    } catch (error) {
      // Fallback to a dummy response if we couldn't get disk info
      return {
        totalSize: 1000000000000, // 1 TB
        freeSize: 500000000000, // 500 GB
        usedSize: 500000000000, // 500 GB
        usedPercentage: 50,
        mountPoint: os.homedir(),
        error: error.message,
      };
    }
  }

  async getTopHeaviestProjects() {
    const projects = await this.projectsService.findAll();

    // Sort by node_modules size
    return projects
      .sort((a, b) => Number(b.nodeModulesSize) - Number(a.nodeModulesSize))
      .slice(0, 10)
      .map((project) => ({
        id: project.id,
        name: project.name,
        path: project.path,
        nodeModulesSize: project.nodeModulesSize,
        dependencyCount: project.dependencyCount,
        lastScanDate: project.lastScanDate,
      }));
  }

  async getCommonDuplicatedDependencies() {
    // Get all analyses
    const analyses = await this.analysisService.getAllAnalyses();

    // Aggregate duplicated dependencies across all projects
    const duplicatedDeps: Record<
      string,
      {
        count: number;
        totalSize: number;
        projects: string[];
      }
    > = {};

    for (const analysis of analyses) {
      if (
        !analysis.duplicatedDependencies ||
        analysis.duplicatedDependencies.length === 0
      ) {
        continue;
      }

      for (const dep of analysis.duplicatedDependencies) {
        if (!duplicatedDeps[dep.name]) {
          duplicatedDeps[dep.name] = {
            count: 0,
            totalSize: 0,
            projects: [],
          };
        }

        duplicatedDeps[dep.name].count++;
        duplicatedDeps[dep.name].totalSize += dep.totalSize;
        duplicatedDeps[dep.name].projects.push(
          analysis.name || analysis.projectId,
        );
      }
    }

    // Convert to array and sort by count
    return Object.entries(duplicatedDeps)
      .map(([name, data]) => ({
        name,
        count: data.count,
        totalSize: data.totalSize,
        projects: data.projects,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
}
