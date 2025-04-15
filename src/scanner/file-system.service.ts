import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import { stat } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);

  async getDirectorySize(directory: string): Promise<number> {
    let size = 0;
    try {
      const files = await fs.readdir(directory);

      const fileSizePromises = files.map(async (file) => {
        const filePath = path.join(directory, file);
        try {
          const stats = await stat(filePath);

          if (stats.isDirectory()) {
            return await this.getDirectorySize(filePath);
          } else {
            return stats.size;
          }
        } catch (error) {
          this.logger.warn(`Error accessing ${filePath}: ${error.message}`);
          return 0;
        }
      });

      const fileSizes = await Promise.all(fileSizePromises);
      size = fileSizes.reduce((total, fileSize) => total + fileSize, 0);
    } catch (error) {
      this.logger.error(
        `Error calculating size for ${directory}: ${error.message}`,
      );
    }

    return size;
  }

  async findNodeModulesFolders(
    basePath: string,
    excludePaths: string[] = [],
    maxDepth: number = 10,
  ): Promise<string[]> {
    const nodeModulesPaths: string[] = [];

    const scan = async (
      currentPath: string,
      currentDepth: number,
    ): Promise<void> => {
      if (currentDepth > maxDepth) return;

      if (
        excludePaths.some((excludePath) => currentPath.includes(excludePath))
      ) {
        return;
      }

      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            if (entry.name === 'node_modules') {
              nodeModulesPaths.push(fullPath);
              // Don't scan inside node_modules directories to avoid recursion issues
              continue;
            }

            await scan(fullPath, currentDepth + 1);
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning ${currentPath}: ${error.message}`);
      }
    };

    await scan(basePath, 0);
    return nodeModulesPaths;
  }

  async getFileStats(filePath: string) {
    try {
      const stats = await stat(filePath);
      return {
        size: stats.size,
        lastAccessed: stats.atime,
        lastModified: stats.mtime,
      };
    } catch (error) {
      this.logger.error(
        `Error getting stats for ${filePath}: ${error.message}`,
      );
      throw error;
    }
  }

  async readPackageJson(directory: string) {
    try {
      const packageJsonPath = path.join(directory, 'package.json');
      const data = await fs.readFile(packageJsonPath, 'utf8');
      return {
        path: packageJsonPath,
        content: JSON.parse(data),
      };
    } catch (error) {
      return null;
    }
  }

  async findParentPackageJson(nodeModulesPath: string) {
    // Typically node_modules is at the same level as package.json
    const potentialProjectPath = path.dirname(nodeModulesPath);
    return await this.readPackageJson(potentialProjectPath);
  }
}
