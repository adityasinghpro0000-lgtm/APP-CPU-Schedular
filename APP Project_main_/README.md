# CPU Scheduling Simulator

This project is a browser-based CPU scheduling simulator. It models jobs, processes, scheduling algorithms, Gantt timelines, and process metrics. It can also run selected Python, C, and C++ source files locally, measure their runtimes, and use those measurements as simulated process burst times.

## Run the application

Install the Python dependencies and start the FastAPI server:

```powershell
cd Backend
python -m pip install -r requirements.txt
python server.py
```

Open <http://127.0.0.1:8000/>. C and C++ files require `gcc` and `g++` respectively to be installed and available on `PATH`. Python files use the Python interpreter that runs the backend.

## Run source program files

1. In **Process queue**, drop source files into the file area or click it to choose files.
2. Select up to 10 files. Each file must be 256 KB or smaller and contain UTF-8 source text.
3. Press **Gantt Play**. The server runs the selected programs, measures successful runs, and builds the simulated process queue from those measurements.
4. Use the Gantt playback controls to inspect execution. The terminal shows source output, run results, and process completion progress.

Supported extensions:

| File type | Extensions | How it runs |
|---|---|---|
| Python | `.py` | Runs with the backend's Python interpreter in isolated mode. |
| C | `.c` | Compiles with `gcc`, then runs the resulting executable. |
| C++ | `.cc`, `.cpp`, `.cxx` | Compiles with `g++`, then runs the resulting executable. |

For each successful program, the simulator converts measured execution time to a burst of `ceil(runtime_ms / 10)` units, clamped to 1–500 units. Compilation time is not included in a successful C or C++ program's measured run time. Each generated process arrives at time 0, uses priority 1, and gets a deadline 10 units after its burst. Failed programs are reported and are not added to the process queue. If none run successfully, the previous process queue is restored.

### Program runner limits

- Compilation has a 10-second timeout. Each program run has a 5-second timeout.
- Standard input is closed, so programs cannot prompt for interactive input.
- Standard output and standard error are returned separately and each is limited to 20,000 characters.
- Source code is executed by the local backend in a temporary working directory. The runner accepts requests from the local computer only. Treat selected files as trusted code; the temporary directory and request checks are not a general-purpose security sandbox.

## Project files

### Frontend

| File | Purpose |
|---|---|
| `Frontend/index.html` | Simulator page structure, process/job controls, Gantt chart, terminal, pipeline, and metrics. |
| `Frontend/styles.css` | Simulator layout, themes, charts, tables, terminal, and responsive styles. |
| `Frontend/app.js` | Scheduling algorithms, simulation snapshots, Gantt rendering, process execution UI, and metrics. |
| `Frontend/api.js` | Browser helpers for calling the profile, workspace, and log APIs. |
| `Frontend/accessibility.js` | Accessibility controls and interaction support. |
| `Frontend/workspace.html` / `Frontend/workspace.css` | Workspace shell and its styling. |
| `Frontend/profile.html` / `Frontend/profile.js` / `Frontend/profile.css` | Profile selection and profile management UI. |
| `Frontend/logs.html` | System log view. |
| `Frontend/about.html` | Project information page. |

### Backend

| File or folder | Purpose |
|---|---|
| `Backend/server.py` | Starts the FastAPI server (or the legacy static server when configured). |
| `Backend/main.py` | Creates the FastAPI app, serves frontend pages, and mounts API routes. |
| `Backend/config.py` | Loads application and server settings. |
| `Backend/api/v1/` | Version 1 endpoints for profiles, workspaces, logs, workloads, saved simulations, and program execution. |
| `Backend/api/v1/programs.py` | Validates, compiles, and runs uploaded source text in a temporary directory. |
| `Backend/models/` | Database models for profiles, workspaces, logs, and saved simulations. |
| `Backend/schemas/` | Request and response validation schemas. |
| `Backend/crud/` | Database create, read, update, and delete operations. |
| `Backend/database/` | Database session and initialization code. |
| `Backend/utils/` | Shared validation, security, and workload-generation helpers. |
| `Backend/requirements.txt` | Python dependencies. |
| `Backend/.env.example` | Example backend environment settings. |

### Tests and supporting documents

- `tests/profile.test.js` contains profile UI tests.
- `README FIRST/` contains additional setup and usage notes.
- `CPU_Scheduling_Simulator_Project_Overview.pdf` contains the project overview.
