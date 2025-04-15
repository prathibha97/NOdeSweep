import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as childProcess from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { ProjectsService } from '../projects/projects.service';
import { ScannerService } from '../scanner/scanner.service';
import { DependencyAnalysis } from './entities/dependency-analysis.entity';

const exec = promisify(childProcess.exec);

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectRepository(DependencyAnalysis)
    private analysisRepository: Repository<DependencyAnalysis>,
    private scannerService: ScannerService,
    private projectsService: ProjectsService,
  ) {}

  async analyzeProject(projectId: string): Promise<DependencyAnalysis> {
    try {
      // Get project information
      const project = await this.projectsService.findOne(projectId);

      // Get the latest scan job for this project
      if (!project.lastScanId) {
        throw new Error(`Project ${projectId} has not been scanned yet`);
      }

      // Get scan results
      const scanResults = await this.scannerService.getScanResults(
        project.lastScanId,
      );

      if (scanResults.length === 0) {
        throw new Error(`No scan results found for project ${projectId}`);
      }

      // Create a new analysis
      const analysis = new DependencyAnalysis();
      analysis.projectId = projectId;
      analysis.scanJobId = project.lastScanId;
      analysis.name = project.name;

      // Analyze duplicated dependencies
      analysis.duplicatedDependencies =
        await this.findDuplicatedDependencies(scanResults);

      // Find unused dependencies
      analysis.unusedDependencies = await this.findUnusedDependencies(
        project.path,
        scanResults,
      );

      // Find heaviest dependencies
      analysis.heaviestDependencies =
        await this.findHeaviestDependencies(scanResults);

      // Build dependency tree
      analysis.dependencyTree = await this.buildDependencyTree(project.path);

      // Generate optimization suggestions
      analysis.optimizationSuggestions = this.generateOptimizationSuggestions(
        analysis.duplicatedDependencies,
        analysis.unusedDependencies,
        analysis.heaviestDependencies,
      );

      // Save analysis
      await this.analysisRepository.save(analysis);

      return analysis;
    } catch (error) {
      this.logger.error(
        `Error analyzing project ${projectId}: ${error.message}`,
      );
      throw error;
    }
  }

  async findDuplicatedDependencies(scanResults: any[]): Promise<any[]> {
    // Track dependencies across all node_modules folders
    const dependencyVersions: Record<string, Set<string>> = {};
    const dependencyLocations: Record<string, Record<string, string[]>> = {};
    const dependencySizes: Record<string, Record<string, number>> = {};

    // Process each scan result (node_modules folder)
    for (const result of scanResults) {
      // Skip if there are no dependencies or the scan result doesn't have related data
      if (!result.dependencies || result.dependencies.length === 0) {
        continue;
      }

      for (const dep of result.dependencies) {
        // Initialize tracking for this dependency if needed
        if (!dependencyVersions[dep.name]) {
          dependencyVersions[dep.name] = new Set();
          dependencyLocations[dep.name] = {};
          dependencySizes[dep.name] = {};
        }

        // Track this version
        dependencyVersions[dep.name].add(dep.version);

        // Track the location of this version
        if (!dependencyLocations[dep.name][dep.version]) {
          dependencyLocations[dep.name][dep.version] = [];
        }
        dependencyLocations[dep.name][dep.version].push(result.path);

        // Track the size of this version
        if (!dependencySizes[dep.name][dep.version]) {
          dependencySizes[dep.name][dep.version] = 0;
        }
        dependencySizes[dep.name][dep.version] = Math.max(
          dependencySizes[dep.name][dep.version],
          dep.size,
        );
      }
    }

    // Find dependencies with multiple versions
    const duplicated = [];

    for (const [name, versions] of Object.entries(dependencyVersions)) {
      if (versions.size > 1) {
        // Calculate total size across all versions
        let totalSize = 0;
        const allLocations = [];

        for (const version of versions) {
          totalSize += dependencySizes[name][version] || 0;
          allLocations.push(...(dependencyLocations[name][version] || []));
        }

        duplicated.push({
          name,
          versions: Array.from(versions),
          totalSize,
          locations: allLocations,
        });
      }
    }

    // Sort by total size, largest first
    return duplicated.sort((a, b) => b.totalSize - a.totalSize);
  }

  async findUnusedDependencies(
    projectPath: string,
    scanResults: any[],
  ): Promise<any[]> {
    const unusedDeps = [];

    try {
      // Try to find package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      let packageJson;

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(packageJsonContent);
      } catch (error) {
        this.logger.warn(
          `Could not read package.json at ${packageJsonPath}: ${error.message}`,
        );
        return [];
      }

      // Find all JS/TS files in the project
      const projectFiles = await this.getAllJsFiles(projectPath);

      // For each dependency in package.json, check if it's used in any file
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        // Skip common build tools and frameworks that might not be directly imported
        const skipList = [
          'webpack',
          'babel',
          'eslint',
          'prettier',
          'jest',
          'mocha',
          'chai',
          'typescript',
          'ts-node',
          '@types/',
          'dotenv',
          'husky',
          'lint-staged',
        ];

        if (skipList.some((item) => depName.includes(item))) {
          continue;
        }

        // Check if this dependency is imported in any file
        const isUsed = await this.isDependencyUsed(depName, projectFiles);

        if (!isUsed) {
          // Find this dependency in scan results to get its size
          let depSize = 0;
          let exactVersion = depVersion;

          for (const result of scanResults) {
            if (!result.dependencies) continue;

            const matchingDep = result.dependencies.find(
              (d) => d.name === depName,
            );
            if (matchingDep) {
              depSize = matchingDep.size;
              exactVersion = matchingDep.version;
              break;
            }
          }

          unusedDeps.push({
            name: depName,
            version: exactVersion,
            size: depSize,
          });
        }
      }

      // Sort by size, largest first
      return unusedDeps.sort((a, b) => b.size - a.size);
    } catch (error) {
      this.logger.error(`Error finding unused dependencies: ${error.message}`);
      return [];
    }
  }

  async findHeaviestDependencies(scanResults: any[]): Promise<any[]> {
    // Aggregate dependency information across all scan results
    const dependencies: Record<string, { size: number; version: string }> = {};
    let totalSize = 0;

    for (const result of scanResults) {
      if (!result.dependencies || result.dependencies.length === 0) {
        continue;
      }

      for (const dep of result.dependencies) {
        if (!dependencies[dep.name] || dependencies[dep.name].size < dep.size) {
          dependencies[dep.name] = {
            size: dep.size,
            version: dep.version,
          };
        }

        totalSize += dep.size;
      }
    }

    // Convert to array and calculate percentage
    const heaviestDeps = Object.entries(dependencies).map(
      ([name, { size, version }]) => ({
        name,
        version,
        size,
        percentOfTotal: totalSize > 0 ? (size / totalSize) * 100 : 0,
      }),
    );

    // Sort by size, largest first
    return heaviestDeps.sort((a, b) => b.size - a.size).slice(0, 20);
  }

  async buildDependencyTree(projectPath: string): Promise<any[]> {
    try {
      // Try to find package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      let packageJson;

      try {
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        packageJson = JSON.parse(packageJsonContent);
      } catch (error) {
        this.logger.warn(
          `Could not read package.json at ${packageJsonPath}: ${error.message}`,
        );
        return [];
      }

      // Try to find node_modules folder
      const nodeModulesPath = path.join(projectPath, 'node_modules');
      try {
        await fs.access(nodeModulesPath);
      } catch (error) {
        this.logger.warn(
          `Could not access node_modules at ${nodeModulesPath}: ${error.message}`,
        );
        return [];
      }

      // Build the dependency tree
      const dependencyTree = [];

      // Process direct dependencies
      const allDeps = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      for (const [depName, depVersion] of Object.entries(allDeps)) {
        try {
          // Try to find this dependency's package.json
          const depPackageJsonPath = path.join(
            nodeModulesPath,
            depName,
            'package.json',
          );
          let depPackageJson;

          try {
            const depPackageJsonContent = await fs.readFile(
              depPackageJsonPath,
              'utf8',
            );
            depPackageJson = JSON.parse(depPackageJsonContent);
          } catch (error) {
            // Skip if we can't read the dependency's package.json
            continue;
          }

          // Get this dependency's dependencies
          const subDependencies = Object.entries(
            depPackageJson.dependencies || {},
          ).map(([name, version]) => ({ name, version: version as string }));

          dependencyTree.push({
            name: depName,
            version: depVersion as string,
            dependencies: subDependencies,
          });
        } catch (error) {
          this.logger.warn(
            `Error processing dependency ${depName}: ${error.message}`,
          );
        }
      }

      return dependencyTree;
    } catch (error) {
      this.logger.error(`Error building dependency tree: ${error.message}`);
      return [];
    }
  }

  generateOptimizationSuggestions(
    duplicatedDeps: any[],
    unusedDeps: any[],
    heaviestDeps: any[],
  ): any[] {
    const suggestions = [];

    // Suggestion for duplicated dependencies
    if (duplicatedDeps.length > 0) {
      const totalWaste = duplicatedDeps.reduce(
        (sum, dep) =>
          sum +
          (dep.totalSize -
            (dep.versions.length > 0
              ? dep.totalSize / dep.versions.length
              : 0)),
        0,
      );

      suggestions.push({
        type: 'Deduplicate Dependencies',
        description: `You have ${duplicatedDeps.length} dependencies with multiple versions. Deduplicating these could save approximately ${this.formatBytes(totalWaste)}.`,
        potentialSavings: totalWaste,
        implementation:
          'Consider using a package.json resolver or manually updating to use consistent versions across your project.',
      });
    }

    // Suggestion for unused dependencies
    if (unusedDeps.length > 0) {
      const totalUnused = unusedDeps.reduce((sum, dep) => sum + dep.size, 0);

      suggestions.push({
        type: 'Remove Unused Dependencies',
        description: `Found ${unusedDeps.length} potentially unused dependencies. Removing these could save approximately ${this.formatBytes(totalUnused)}.`,
        potentialSavings: totalUnused,
        implementation:
          'Run "npm prune" after removing these dependencies from your package.json.',
      });
    }

    // Suggestion for heavy dependencies
    const heavyThreshold = 10; // 10% of total size
    const heavyDeps = heaviestDeps.filter(
      (dep) => dep.percentOfTotal > heavyThreshold,
    );

    if (heavyDeps.length > 0) {
      suggestions.push({
        type: 'Consider Alternatives for Heavy Dependencies',
        description: `You have ${heavyDeps.length} dependencies that each take up more than ${heavyThreshold}% of your total dependency size.`,
        potentialSavings: heavyDeps.reduce((sum, dep) => sum + dep.size, 0) / 2, // Assume we can save half by switching
        implementation:
          'Research lighter alternatives or consider implementing some functionality yourself.',
      });
    }

    // Suggestion for production vs dev dependencies
    suggestions.push({
      type: 'Separate Production and Development Dependencies',
      description:
        'Make sure all development tools are in devDependencies to reduce production bundle size.',
      potentialSavings: 0, // Can't estimate without more information
      implementation:
        'Move testing, linting, and build tools to devDependencies in package.json.',
    });

    return suggestions;
  }

  async getAllJsFiles(directory: string): Promise<string[]> {
    const jsFiles: string[] = [];

    const scan = async (currentPath: string) => {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            // Skip node_modules and hidden directories
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
              continue;
            }

            await scan(fullPath);
          } else if (entry.isFile()) {
            // Check if it's a JS/TS file
            const ext = path.extname(entry.name).toLowerCase();
            if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
              jsFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning ${currentPath}: ${error.message}`);
      }
    };

    await scan(directory);
    return jsFiles;
  }

  async isDependencyUsed(depName: string, files: string[]): Promise<boolean> {
    // Normalize dependency name for imports
    // e.g., 'some-package' might be imported as 'somePackage'
    const normalizedName = depName.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    );

    // For scoped packages like @org/package
    const packageName = depName.startsWith('@')
      ? depName
      : depName.split('/')[0];

    // Regular expressions to match different import styles
    const importPatterns = [
      new RegExp(`from\\s+['"]${packageName}(/|['"])`, 'i'), // ES6 imports
      new RegExp(`require\\s*\\(\\s*['"]${packageName}(/|['"])`, 'i'), // CommonJS require
      new RegExp(`import\\s*\\(\\s*['"]${packageName}(/|['"])`, 'i'), // Dynamic imports
    ];

    // Check each file for imports
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf8');

        // Check if any import pattern matches
        if (importPatterns.some((pattern) => pattern.test(content))) {
          return true;
        }
      } catch (error) {
        this.logger.warn(`Error reading file ${file}: ${error.message}`);
      }
    }

    return false;
  }

  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  async getAnalysisByProjectId(projectId: string): Promise<DependencyAnalysis> {
    const analysis = await this.analysisRepository.findOne({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    if (!analysis) {
      throw new NotFoundException(`No analysis found for project ${projectId}`);
    }

    return analysis;
  }

  async getAllAnalyses(): Promise<DependencyAnalysis[]> {
    return this.analysisRepository.find({
      order: { createdAt: 'DESC' },
    });
  }
}
