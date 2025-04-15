# NOdeSweep: Node Modules Management Tool

NOdeSweep is a comprehensive tool for scanning, analyzing, and managing `node_modules` directories across your projects. It helps you reclaim disk space, identify duplicate dependencies, and optimize your JavaScript/TypeScript projects.

## Features

- **Storage Analysis**: Scan file system for node_modules folders and analyze disk usage
- **Project Management**: Auto-detect projects with package.json files
- **Cleanup Tools**: Safely remove unused or outdated node_modules directories
- **Dependency Analysis**: Identify duplicated dependencies and heavy packages
- **Optimization Suggestions**: Get actionable insights to reduce dependency bloat

## Tech Stack

- **Backend**: NestJS with TypeScript
- **Database**: SQLite (easily upgradable to PostgreSQL/MySQL)
- **Frontend**: React (to be implemented)

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/nodesweep.git
   cd nodesweep
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```
   PORT=3000
   DATABASE_FILE=nodesweep.db
   ```

4. Build the project:
   ```bash
   npm run build
   ```

### Running the Application

Start the development server:
```bash
npm run start:dev
```

The API will be available at http://localhost:3000

## API Documentation

Swagger documentation is available at http://localhost:3000/api-docs when the server is running.

### Core Endpoints

#### Scanner

- `POST /scanner/jobs` - Create and start a new scan job
- `GET /scanner/jobs` - List all scan jobs
- `GET /scanner/jobs/:id` - Get details for a specific scan job
- `GET /scanner/results` - Get scan results, optionally filtered by job ID

#### Projects

- `POST /projects` - Create a new project
- `GET /projects` - List all projects
- `GET /projects/:id` - Get details for a specific project
- `PUT /projects/:id` - Update a project
- `DELETE /projects/:id` - Delete a project
- `POST /projects/:id/scan` - Scan a specific project
- `POST /projects/detect` - Auto-detect projects in a specified directory

#### Cleanup

- `POST /cleanup/jobs` - Create and start a new cleanup job
- `GET /cleanup/jobs` - List all cleanup jobs
- `GET /cleanup/jobs/:id` - Get details for a specific cleanup job

#### Analysis

- `POST /analysis/projects/:id` - Analyze a project's dependencies
- `GET /analysis/projects/:id` - Get analysis results for a project
- `GET /analysis` - Get all analyses

#### Dashboard API

- `GET /api/dashboard` - Get summary statistics for the dashboard
- `GET /api/top-heaviest-projects` - Get the projects with the largest node_modules
- `GET /api/common-duplicated-dependencies` - Get commonly duplicated dependencies across projects

## Development

### Project Structure

```
src/
├── app.module.ts          # Main application module
├── main.ts                # Entry point
├── scanner/               # Scanner module (core scanning functionality)
├── projects/              # Projects module (project management)
├── cleanup/               # Cleanup module (node_modules cleanup)
├── analysis/              # Analysis module (dependency analysis)
└── api/                   # API module (frontend-facing endpoints)
```

### Setting Up for Development

1. Install development dependencies:
   ```bash
   npm install --save-dev @nestjs/testing jest supertest
   ```

2. Run tests:
   ```bash
   npm test
   ```

## Frontend Development (To Be Implemented)

The frontend will be built with React and will provide:

- Visual dashboard for storage analysis
- Project management interface
- Cleanup tools with confirmation dialogs
- Dependency visualization
- Settings for scan configurations

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.