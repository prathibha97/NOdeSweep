import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  path: string;

  @Column({ nullable: true })
  description: string;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  lastScanId: string;

  @Column({ nullable: true })
  lastScanDate: Date;

  @Column('bigint', { default: 0 })
  totalSize: number;

  @Column('bigint', { default: 0 })
  nodeModulesSize: number;

  @Column({ default: 0 })
  dependencyCount: number;

  @Column({ default: false })
  hasPackageJson: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Calculated fields (not stored in DB)
  nodeModulesSizePercent?: number;
  lastAccessedDate?: Date;
}
