import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ScannerService } from '../scanner/scanner.service';
import { CreateCleanupJobDto } from './dto/cleanup.dto';
import { CleanupJob } from './entities/cleanup-job.entity';
import { CleanupResult } from './entities/cleanup-result.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(CleanupJob)
    private cleanupJobRepository: Repository<CleanupJob>,
    @InjectRepository(CleanupResult)
    private cleanupResultRepository: Repository<CleanupResult>,
    private scannerService: ScannerService,
  ) {}

  async createCleanupJob(
    createCleanupJobDto: CreateCleanupJobDto,
  ): Promise<CleanupJob> {
    const cleanupJob = this.cleanupJobRepository.create({
      ...createCleanupJobDto,
      status: 'pending',
    });

    await this.cleanupJobRepository.save(cleanupJob);
    return cleanupJob;
  }

  async findAll(): Promise<CleanupJob[]> {
    return this.cleanupJobRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<CleanupJob> {
    const cleanupJob = await this.cleanupJobRepository.findOne({
      where: { id },
      relations: ['results'],
    });

    if (!cleanupJob) {
      throw new NotFoundException(`Cleanup job with ID ${id} not found`);
    }

    return cleanupJob;
  }

  async executeCleanupJob(jobId: string): Promise<CleanupJob> {
    const job = await this.findOne(jobId);

    try {
      job.status = 'active';
      await this.cleanupJobRepository.save(job);

      let totalSpaceReclaimed = 0;

      switch (job.strategy) {
        case 'all':
          // Delete all specified node_modules directories
          for (const targetPath of job.targetPaths) {
            const result = await this.cleanupNodeModules(targetPath, job);
            if (result.success) {
              totalSpaceReclaimed += Number(result.sizeReclaimed);
            }
          }
          break;

        case 'unused':
          // Delete node_modules that haven't been accessed in a while
          // First, we need to check access times
          for (const targetPath of job.targetPaths) {
            const result = await this.cleanupUnusedNodeModules(targetPath, job);
            if (result.success) {
              totalSpaceReclaimed += Number(result.sizeReclaimed);
            }
          }
          break;

        case 'older-than':
          // Delete node_modules older than a specified number of days
          if (!job.olderThanDays) {
            throw new Error(
              'olderThanDays parameter is required for older-than strategy',
            );
          }

          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - job.olderThanDays);

          for (const targetPath of job.targetPaths) {
            const result = await this.cleanupOlderNodeModules(
              targetPath,
              cutoffDate,
              job,
            );
            if (result.success) {
              totalSpaceReclaimed += Number(result.sizeReclaimed);
            }
          }
          break;

        case 'specific':
          // Delete specific node_modules directories
          for (const targetPath of job.targetPaths) {
            if (path.basename(targetPath) !== 'node_modules') {
              this.logger.warn(
                `Path ${targetPath} does not point to a node_modules directory. Skipping.`,
              );
              continue;
            }

            const result = await this.cleanupNodeModules(targetPath, job);
            if (result.success) {
              totalSpaceReclaimed += Number(result.sizeReclaimed);
            }
          }
          break;

        default:
          throw new Error(`Unknown cleanup strategy: ${job.strategy}`);
      }

      job.status = 'completed';
      job.spaceReclaimed = totalSpaceReclaimed;
      job.completedAt = new Date();
      await this.cleanupJobRepository.save(job);

      return job;
    } catch (error) {
      this.logger.error(
        `Error executing cleanup job ${jobId}: ${error.message}`,
      );
      job.status = 'failed';
      job.error = error.message;
      await this.cleanupJobRepository.save(job);
      throw error;
    }
  }

  private async cleanupNodeModules(
    dirPath: string,
    job: CleanupJob,
  ): Promise<CleanupResult> {
    const result = this.cleanupResultRepository.create({
      path: dirPath,
      sizeReclaimed: 0,
      success: false,
      cleanupJob: job,
    });

    try {
      // Check if the directory exists and is a node_modules directory
      try {
        const stats = await fs.stat(dirPath);
        if (!stats.isDirectory()) {
          throw new Error(`Path ${dirPath} is not a directory`);
        }
      } catch (error) {
        throw new Error(`Cannot access directory ${dirPath}: ${error.message}`);
      }

      // Get the size before deletion
      let size = 0;
      try {
        // We should use a more efficient directory size calculation in production
        // This is a simplified version
        const fileSystemService = {
          getDirectorySize: async (dir: string) => {
            // Recursive function to calculate directory size
            const calculateSize = async (
              currentPath: string,
            ): Promise<number> => {
              let totalSize = 0;

              try {
                const entries = await fs.readdir(currentPath, {
                  withFileTypes: true,
                });

                for (const entry of entries) {
                  const entryPath = path.join(currentPath, entry.name);

                  if (entry.isDirectory()) {
                    totalSize += await calculateSize(entryPath);
                  } else if (entry.isFile()) {
                    const stats = await fs.stat(entryPath);
                    totalSize += stats.size;
                  }
                }
              } catch (error) {
                this.logger.warn(
                  `Error calculating size for ${currentPath}: ${error.message}`,
                );
              }

              return totalSize;
            };

            return calculateSize(dir);
          },
        };

        size = await fileSystemService.getDirectorySize(dirPath);
      } catch (error) {
        this.logger.warn(
          `Could not determine size for ${dirPath}: ${error.message}`,
        );
      }

      // If it's a dry run, don't actually delete
      if (job.dryRun) {
        result.sizeReclaimed = size;
        result.success = true;
        await this.cleanupResultRepository.save(result);
        return result;
      }

      // Delete the directory
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        result.sizeReclaimed = size;
        result.success = true;
      } catch (error) {
        result.error = `Failed to delete ${dirPath}: ${error.message}`;
        this.logger.error(result.error);
      }
    } catch (error) {
      result.error = error.message;
      this.logger.error(`Error during cleanup of ${dirPath}: ${error.message}`);
    }

    await this.cleanupResultRepository.save(result);
    return result;
  }

  private async cleanupUnusedNodeModules(
    basePath: string,
    job: CleanupJob,
  ): Promise<CleanupResult> {
    const result = this.cleanupResultRepository.create({
      path: basePath,
      sizeReclaimed: 0,
      success: true, // Start optimistic
      cleanupJob: job,
    });

    try {
      // Find all node_modules directories
      const nodeModulesPaths = await this.findNodeModulesFolders(basePath);

      // Check each node_modules directory's access time
      const unusedPaths: { path: string; size: number }[] = [];

      for (const nodeModulesPath of nodeModulesPaths) {
        try {
          const stats = await fs.stat(nodeModulesPath);

          // Check if there's a package.json in the parent directory
          const parentDir = path.dirname(nodeModulesPath);
          const packageJsonPath = path.join(parentDir, 'package.json');

          let isUnused = false;

          try {
            // Check if package.json exists and when it was last modified
            const packageJsonStats = await fs.stat(packageJsonPath);

            // If package.json was modified more recently than node_modules
            // was accessed, it might mean the project is still in use
            if (packageJsonStats.mtime > stats.atime) {
              isUnused = false;
            } else {
              // Check if node_modules hasn't been accessed in 30 days
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

              if (stats.atime < thirtyDaysAgo) {
                isUnused = true;
              }
            }
          } catch (error) {
            // No package.json, consider unused if not accessed in 15 days
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

            if (stats.atime < fifteenDaysAgo) {
              isUnused = true;
            }
          }

          if (isUnused) {
            // Get directory size
            let size = 0;
            try {
              const fileSystemService = {
                getDirectorySize: async (dir: string) => {
                  // Simplified implementation
                  return 0;
                },
              };

              size = await fileSystemService.getDirectorySize(nodeModulesPath);
            } catch (error) {
              this.logger.warn(
                `Could not determine size for ${nodeModulesPath}: ${error.message}`,
              );
            }

            unusedPaths.push({ path: nodeModulesPath, size });
          }
        } catch (error) {
          this.logger.warn(
            `Could not check ${nodeModulesPath}: ${error.message}`,
          );
        }
      }

      // Delete unused node_modules if not a dry run
      if (!job.dryRun) {
        for (const { path: unusedPath, size } of unusedPaths) {
          try {
            await fs.rm(unusedPath, { recursive: true, force: true });
            result.sizeReclaimed += size;
          } catch (error) {
            this.logger.error(
              `Failed to delete ${unusedPath}: ${error.message}`,
            );
          }
        }
      } else {
        // For dry run, just sum up the sizes
        result.sizeReclaimed = unusedPaths.reduce(
          (sum, { size }) => sum + size,
          0,
        );
      }
    } catch (error) {
      result.error = error.message;
      result.success = false;
      this.logger.error(
        `Error during unused cleanup of ${basePath}: ${error.message}`,
      );
    }

    await this.cleanupResultRepository.save(result);
    return result;
  }

  private async cleanupOlderNodeModules(
    basePath: string,
    cutoffDate: Date,
    job: CleanupJob,
  ): Promise<CleanupResult> {
    const result = this.cleanupResultRepository.create({
      path: basePath,
      sizeReclaimed: 0,
      success: true, // Start optimistic
      cleanupJob: job,
    });

    try {
      // Find all node_modules directories
      const nodeModulesPaths = await this.findNodeModulesFolders(basePath);

      // Check each node_modules directory's modification time
      const olderPaths: { path: string; size: number }[] = [];

      for (const nodeModulesPath of nodeModulesPaths) {
        try {
          const stats = await fs.stat(nodeModulesPath);

          if (stats.mtime < cutoffDate) {
            // Get directory size
            let size = 0;
            try {
              const fileSystemService = {
                getDirectorySize: async (dir: string) => {
                  // Simplified implementation
                  return 0;
                },
              };

              size = await fileSystemService.getDirectorySize(nodeModulesPath);
            } catch (error) {
              this.logger.warn(
                `Could not determine size for ${nodeModulesPath}: ${error.message}`,
              );
            }

            olderPaths.push({ path: nodeModulesPath, size });
          }
        } catch (error) {
          this.logger.warn(
            `Could not check ${nodeModulesPath}: ${error.message}`,
          );
        }
      }

      // Delete older node_modules if not a dry run
      if (!job.dryRun) {
        for (const { path: olderPath, size } of olderPaths) {
          try {
            await fs.rm(olderPath, { recursive: true, force: true });
            result.sizeReclaimed += size;
          } catch (error) {
            this.logger.error(
              `Failed to delete ${olderPath}: ${error.message}`,
            );
          }
        }
      } else {
        // For dry run, just sum up the sizes
        result.sizeReclaimed = olderPaths.reduce(
          (sum, { size }) => sum + size,
          0,
        );
      }
    } catch (error) {
      result.error = error.message;
      result.success = false;
      this.logger.error(
        `Error during older cleanup of ${basePath}: ${error.message}`,
      );
    }

    await this.cleanupResultRepository.save(result);
    return result;
  }

  private async findNodeModulesFolders(basePath: string): Promise<string[]> {
    const nodeModulesPaths: string[] = [];

    const scan = async (currentPath: string, depth = 0, maxDepth = 10) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.name === 'node_modules') {
              nodeModulesPaths.push(fullPath);
              // Don't scan inside node_modules directories to avoid recursion
              continue;
            }

            // Skip hidden directories
            if (entry.name.startsWith('.')) continue;

            await scan(fullPath, depth + 1, maxDepth);
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning ${currentPath}: ${error.message}`);
      }
    };

    await scan(basePath);
    return nodeModulesPaths;
  }
}
