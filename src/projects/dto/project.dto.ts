export class CreateProjectDto {
  name: string;
  path: string;
  description?: string;
  tags?: string[];
}

export class UpdateProjectDto {
  name?: string;
  description?: string;
  tags?: string[];
  active?: boolean;
}
