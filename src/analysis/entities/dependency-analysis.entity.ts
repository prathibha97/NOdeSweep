import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class DependencyAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @Column()
  scanJobId: string;

  @Column({ nullable: true })
  name: string;

  @Column('simple-json')
  duplicatedDependencies: {
    name: string;
    versions: string[];
    totalSize: number;
    locations: string[];
  }[];

  @Column('simple-json')
  unusedDependencies: {
    name: string;
    version: string;
    size: number;
  }[];

  @Column('simple-json')
  heaviestDependencies: {
    name: string;
    version: string;
    size: number;
    percentOfTotal: number;
  }[];

  @Column('simple-json')
  dependencyTree: {
    name: string;
    version: string;
    dependencies: { name: string; version: string }[];
  }[];

  @Column('simple-json', { nullable: true })
  optimizationSuggestions: {
    type: string;
    description: string;
    potentialSavings: number;
    implementation: string;
  }[];

  @CreateDateColumn()
  createdAt: Date;
}
