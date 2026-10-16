# CPU Scheduling Simulator

This project is a browser-based CPU scheduling simulator. It models jobs, processes, scheduling algorithms, Gantt timelines, and process metrics. It can also run selected Python, C, and C++ source files locally, measure their runtimes, and use those measurements as simulated process burst times.

## Run the application

Install the Python dependencies and start the FastAPI server:

```powershell
cd Backend
python -m pip install -r requirements.txt
python server.py
```

Open <http://127.0.0.1:8000/> to sign up or log in; the login screen is the app homepage. Signed-in users continue to the profile picker, and signed-out visits to `index.html` return to login. The login page includes the shared CPU chip logo, dark theme and accessibility controls, and a **Try the Demo Simulator** link for guest access. Demo mode opens the simulator without an account. C and C++ files require `gcc` and `g++` respectively to be installed and available on `PATH`. Python files use the Python interpreter that runs the backend.

### Database and account setup

The backend uses the SQLAlchemy connection in `DATABASE_URL`. The default connection is MySQL at `localhost`, using the `cpu_scheduling` database. Create that database in MySQL before launching the server:

```sql
CREATE DATABASE cpu_scheduling;
```

Copy `Backend/.env.example` to `Backend/.env`, then set the database credentials and a private random signing key. For example:

```env
DATABASE_URL=mysql+pymysql://root:your_password@localhost/cpu_scheduling
SECRET_KEY=replace-with-a-long-random-secret
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_USE_TLS=true
APP_PUBLIC_URL=http://127.0.0.1:8000
```

`Backend/.env.example` is the safe configuration template and is tracked by Git; `Backend/.env` is local-only and intentionally ignored. If a copy of the repository is missing the template, create `Backend/.env` yourself with at least these settings, adjusting the database URL for your MySQL username and password:

```env
DATABASE_URL=mysql+pymysql://root@localhost/cpu_scheduling
SECRET_KEY=replace-with-a-long-private-random-value
```

The remaining settings are optional for local development. Password-reset emails require valid SMTP settings; without them, account recovery email is unavailable. Do not commit `Backend/.env` or use the example signing key in a deployed environment.

The server creates its tables at startup. Signup requires a unique username (3–50 letters, numbers, underscores, periods, or hyphens), a unique email address, and a password of at least 8 characters. Passwords are never stored as readable text. The `users.password_hash` column stores a value in this format:

```text
pbkdf2_sha256$<salt-hex>$<derived-key-hex>
```

The backend creates a fresh, cryptographically random 16-byte salt for each password, then derives a 32-byte key with PBKDF2-HMAC-SHA-256 using 310,000 iterations. The salt and derived key are hex-encoded in the stored value. During login, the backend repeats the derivation using the supplied password and stored salt, then compares the result with the stored key using a constant-time comparison. A different salt means identical passwords produce different stored values. Password reset replaces the stored hash with a newly salted one. Login issues a JWT access token; the browser keeps it in local storage for the session.

Password recovery uses the SMTP settings above to email a reset link that expires after 30 minutes. Set `APP_PUBLIC_URL` to the address where users open the app. Reset links are not sent until valid SMTP settings are configured.

Authentication API endpoints (under `/api/v1/auth`):

| Method and path | Purpose |
|---|---|
| `POST /signup` | Create an account with JSON fields `username`, `email`, and `password`. |
| `POST /token` | Log in using form fields `username` and `password`; returns a bearer access token. |
| `POST /forgot-password` | Email a time-limited reset link to a registered email address. |
| `POST /reset-password` | Set a new password using the reset token and `new_password`. |
| `GET /account` | Return the account for a valid `Authorization: Bearer <token>`. |

## Run source program files

1. In **Process queue**, drop source files into the file area or click it to choose files. They appear immediately in **Job scheduler** as pending program jobs with an unmeasured burst; they are not placeholder processes and cannot be admitted until measured.
2. Select up to 10 files. Each file must be 256 KB or smaller and contain UTF-8 source text.
3. Press **Gantt Play**. The server runs the selected programs, measures successful runs, and adds simulated processes for them to the existing process queue.
4. Use the Gantt playback controls to inspect execution. The terminal shows source output, run results, and process completion progress.

Supported extensions:

| File type | Extensions | How it runs |
|---|---|---|
| Python | `.py` | Runs with the backend's Python interpreter in isolated mode. |
| C | `.c` | Compiles with `gcc`, then runs the resulting executable. |
| C++ | `.cc`, `.cpp`, `.cxx` | Compiles with `g++`, then runs the resulting executable. |

For each successful program, the simulator converts measured execution time to a burst of `ceil(runtime_ms / 10)` units, clamped to 1–500 units. Compilation time is not included in a successful C or C++ program's measured run time. Each generated process arrives at time 0, uses priority 1, and gets a deadline 10 units after its burst. Failed programs are reported and are not added to the process queue. If none run successfully, the previous process queue is restored.

## Screenshots

### Sign in

![CPU Scheduling Simulator sign-in page](screenshots/login.png)

### Profiles

![CPU Scheduling Simulator process queue in demo mode](screenshots/Profiles.png)

### Workspace

![CPU Scheduling Simulator workspace](screenshots/workspace.png)

### Simulator demo

![CPU Scheduling Simulator process queue in demo mode](screenshots/simulator.png)


### Job scheduler

![CPU Scheduling Simulator job scheduler](screenshots/JobSchedular.png)

### Process queue

![CPU Scheduling Simulator process queue](screenshots/Process%20Queue.png)

### Gantt chart process swimlanes

![CPU Scheduling Simulator Gantt chart with process swimlanes](screenshots/Gantt%20Chart%20Process%20Swimlanes.png)

### Process metrics

![CPU Scheduling Simulator process metrics](screenshots/Process%20Metrics.png)

### Algorithm benchmark

![CPU Scheduling Simulator algorithm benchmark](screenshots/Algorithm%20Benchmark.png)

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
| `Frontend/auth.html` / `Frontend/auth.js` / `Frontend/auth.css` | Signup and login page, morphing artwork, theme toggle, and accessibility controls. |
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
| `Backend/models/user.py` | Registered account model used by signup and login. |
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
