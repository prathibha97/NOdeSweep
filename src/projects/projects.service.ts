import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { ScannerService } from '../scanner/scanner.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { Project } from './entities/project.entity';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private scannerService: ScannerService,
  ) {}

  async create(createProjectDto: CreateProjectDto): Promise<Project> {
    const project = this.projectRepository.create(createProjectDto);
    await this.projectRepository.save(project);
    return project;
  }

  async findAll(includeInactive = false): Promise<Project[]> {
    const query = this.projectRepository.createQueryBuilder('project');

    if (!includeInactive) {
      query.where('project.active = :active', { active: true });
    }

    const projects = await query.getMany();

    // Calculate percentages
    return projects.map((project) => {
      if (project.totalSize > 0) {
        project.nodeModulesSizePercent =
          (project.nodeModulesSize / project.totalSize) * 100;
      } else {
        project.nodeModulesSizePercent = 0;
      }
      return project;
    });
  }

  async findOne(id: string): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }

    if (project.totalSize > 0) {
      project.nodeModulesSizePercent =
        (project.nodeModulesSize / project.totalSize) * 100;
    } else {
      project.nodeModulesSizePercent = 0;
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.findOne(id);

    Object.assign(project, updateProjectDto);

    await this.projectRepository.save(project);
    return project;
  }

  async remove(id: string): Promise<void> {
    const project = await this.findOne(id);
    await this.projectRepository.remove(project);
  }

  async scanProject(id: string): Promise<any> {
    const project = await this.findOne(id);

    // Create a scan job for just this project path
    const scanJob = await this.scannerService.createScanJob([project.path], {
      includeNodeModules: true,
    });

    // Execute the scan
    await this.scannerService.executeScanJob(scanJob.id);

    // Update project information based on scan results
    const scanResults = await this.scannerService.getScanResults(scanJob.id);

    if (scanResults.length > 0) {
      // Calculate total size and node_modules size
      let totalSize = 0;
      let nodeModulesSize = 0;
      let hasPackageJson = false;
      let dependencyCount = 0;
      let lastAccessedDate = null;

      for (const result of scanResults) {
        nodeModulesSize += Number(result.size);
        dependencyCount += result.dependencyCount;

        if (result.packageJsonPath) {
          hasPackageJson = true;
        }

        if (!lastAccessedDate || result.lastAccessed > lastAccessedDate) {
          lastAccessedDate = result.lastAccessed;
        }
      }

      // Try to get total project size
      try {
        const stats = await fs.stat(project.path);
        if (stats.isDirectory()) {
          // This would ideally use a more efficient way to calculate directory size
          // For simplicity, we're setting it to node_modules size + an arbitrary value
          totalSize = nodeModulesSize * 1.5; // Just an estimation
        } else {
          totalSize = stats.size;
        }
      } catch (error) {
        this.logger.warn(
          `Could not determine total size for project ${project.id}: ${error.message}`,
        );
        totalSize = nodeModulesSize;
      }

      // Update project with scan information
      project.lastScanId = scanJob.id;
      project.lastScanDate = new Date();
      project.totalSize = totalSize;
      project.nodeModulesSize = nodeModulesSize;
      project.dependencyCount = dependencyCount;
      project.hasPackageJson = hasPackageJson;
      project.lastAccessedDate = lastAccessedDate;

      await this.projectRepository.save(project);
    }

    return {
      project,
      scanJob,
      scanResults,
    };
  }

  async detectProjects(basePath: string): Promise<Project[]> {
    const projects: Project[] = [];

    const findPackageJsonFiles = async (
      dir: string,
      depth = 0,
      maxDepth = 5,
    ) => {
      if (depth > maxDepth) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        // Check if this directory has a package.json
        const hasPackageJson = entries.some(
          (entry) => entry.isFile() && entry.name === 'package.json',
        );

        if (hasPackageJson) {
          try {
            const packageJsonPath = path.join(dir, 'package.json');
            const packageJsonContent = JSON.parse(
              await fs.readFile(packageJsonPath, 'utf8'),
            );

            const projectName = packageJsonContent.name || path.basename(dir);

            // Create a new project
            const project = this.projectRepository.create({
              name: projectName,
              path: dir,
              description: packageJsonContent.description,
              hasPackageJson: true,
            });

            projects.push(project);

            // Don't go deeper if we found a project
            return;
          } catch (error) {
            this.logger.warn(
              `Error processing package.json in ${dir}: ${error.message}`,
            );
          }
        }

        // Recursively search subdirectories
        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules'
          ) {
            await findPackageJsonFiles(
              path.join(dir, entry.name),
              depth + 1,
              maxDepth,
            );
          }
        }
      } catch (error) {
        this.logger.warn(`Error scanning directory ${dir}: ${error.message}`);
      }
    };

    await findPackageJsonFiles(basePath);

    // Save all detected projects
    if (projects.length > 0) {
      await this.projectRepository.save(projects);
    }

    return projects;
  }
}
