import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { Repository } from 'typeorm';
import { DependencyInfo } from './entities/dependency-info.entity';
import { ScanJob } from './entities/scan-job.entity';
import { ScanResult } from './entities/scan-result.entity';
import { FileSystemService } from './file-system.service';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    @InjectRepository(ScanResult)
    private scanResultRepository: Repository<ScanResult>,
    @InjectRepository(ScanJob)
    private scanJobRepository: Repository<ScanJob>,
    private fileSystemService: FileSystemService,
  ) {}

  async createScanJob(
    basePaths: string[],
    options: {
      includeNodeModules?: boolean;
      includeGitFolders?: boolean;
    } = {},
  ): Promise<ScanJob> {
    const scanJob = this.scanJobRepository.create({
      basePaths,
      includeNodeModules: options.includeNodeModules || false,
      includeGitFolders: options.includeGitFolders || false,
      status: 'pending',
    });

    await this.scanJobRepository.save(scanJob);
    return scanJob;
  }

  async executeScanJob(scanJobId: string): Promise<void> {
    const scanJob = await this.scanJobRepository.findOne({
      where: { id: scanJobId },
    });

    if (!scanJob) {
      throw new Error(`Scan job with ID ${scanJobId} not found`);
    }

    try {
      scanJob.status = 'active';
      await this.scanJobRepository.save(scanJob);

      const excludePaths = [];
      if (!scanJob.includeGitFolders) {
        excludePaths.push('.git');
      }

      let totalNodeModulesFound = 0;

      for (const basePath of scanJob.basePaths) {
        const nodeModulesPaths =
          await this.fileSystemService.findNodeModulesFolders(
            basePath,
            excludePaths,
          );

        totalNodeModulesFound += nodeModulesPaths.length;

        for (const nodeModulesPath of nodeModulesPaths) {
          await this.processNodeModulesFolder(nodeModulesPath, scanJob);
        }
      }

      scanJob.status = 'completed';
      scanJob.totalNodeModulesFound = totalNodeModulesFound;
      scanJob.completedAt = new Date();
      await this.scanJobRepository.save(scanJob);
    } catch (error) {
      this.logger.error(
        `Error executing scan job ${scanJobId}: ${error.message}`,
      );
      scanJob.status = 'failed';
      scanJob.error = error.message;
      await this.scanJobRepository.save(scanJob);
    }
  }

  private async processNodeModulesFolder(
    nodeModulesPath: string,
    scanJob: ScanJob,
  ): Promise<void> {
    try {
      const size =
        await this.fileSystemService.getDirectorySize(nodeModulesPath);
      const stats = await this.fileSystemService.getFileStats(nodeModulesPath);

      // Try to find the associated package.json
      const packageJson =
        await this.fileSystemService.findParentPackageJson(nodeModulesPath);

      const scanResult = new ScanResult();
      scanResult.path = nodeModulesPath;
      scanResult.size = size;
      scanResult.lastAccessed = stats.lastAccessed;
      scanResult.lastModified = stats.lastModified;
      scanResult.scanJob = scanJob;

      if (packageJson) {
        scanResult.packageJsonPath = packageJson.path;
        scanResult.projectName =
          packageJson.content.name ||
          path.basename(path.dirname(nodeModulesPath));
        scanResult.projectVersion = packageJson.content.version || 'unknown';

        // Process dependencies
        const dependencies = [];

        // Process regular dependencies
        if (packageJson.content.dependencies) {
          for (const [name, version] of Object.entries(
            packageJson.content.dependencies,
          )) {
            const depPath = path.join(nodeModulesPath, name);
            let depSize = 0;

            try {
              depSize = await this.fileSystemService.getDirectorySize(depPath);
            } catch (error) {
              this.logger.warn(
                `Could not calculate size for dependency ${name}: ${error.message}`,
              );
            }

            dependencies.push({
              name,
              version: version as string,
              size: depSize,
              isDev: false,
              isOptional: false,
            });
          }
        }

        // Process dev dependencies
        if (packageJson.content.devDependencies) {
          for (const [name, version] of Object.entries(
            packageJson.content.devDependencies,
          )) {
            const depPath = path.join(nodeModulesPath, name);
            let depSize = 0;

            try {
              depSize = await this.fileSystemService.getDirectorySize(depPath);
            } catch (error) {
              this.logger.warn(
                `Could not calculate size for dev dependency ${name}: ${error.message}`,
              );
            }

            dependencies.push({
              name,
              version: version as string,
              size: depSize,
              isDev: true,
              isOptional: false,
            });
          }
        }

        scanResult.dependencyCount = dependencies.length;
        await this.scanResultRepository.save(scanResult);

        // Save dependencies
        for (const dep of dependencies) {
          const depInfo = new DependencyInfo();
          depInfo.name = dep.name;
          depInfo.version = dep.version;
          depInfo.size = dep.size;
          depInfo.isDev = dep.isDev;
          depInfo.isOptional = dep.isOptional;
          depInfo.scanResult = scanResult;

          // Save individually to avoid excessive memory usage
          await this.scanResultRepository.manager.save(depInfo);
        }
      } else {
        // If we couldn't find a package.json, just save the basic scan result
        scanResult.dependencyCount = 0;
        await this.scanResultRepository.save(scanResult);
      }
    } catch (error) {
      this.logger.error(
        `Error processing node_modules folder at ${nodeModulesPath}: ${error.message}`,
      );
      throw error;
    }
  }

  async getScanJobs(
    status?: 'pending' | 'active' | 'completed' | 'failed',
  ): Promise<ScanJob[]> {
    const query = this.scanJobRepository.createQueryBuilder('scanJob');

    if (status) {
      query.where('scanJob.status = :status', { status });
    }

    query.orderBy('scanJob.createdAt', 'DESC');

    return await query.getMany();
  }

  async getScanJobById(id: string): Promise<ScanJob> {
    return await this.scanJobRepository.findOne({
      where: { id },
      relations: ['results'],
    });
  }

  async getScanResults(scanJobId?: string): Promise<ScanResult[]> {
    const query = this.scanResultRepository.createQueryBuilder('scanResult');

    if (scanJobId) {
      query.where('scanResult.scanJobId = :scanJobId', { scanJobId });
    }

    query.orderBy('scanResult.size', 'DESC');

    return await query.getMany();
  }
}
