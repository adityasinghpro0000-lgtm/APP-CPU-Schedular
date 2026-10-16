"""Run a small, trusted source file in a temporary local workspace."""

import os
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

router = APIRouter()
ALLOWED_EXTENSIONS = {".py", ".c", ".cc", ".cpp", ".cxx"}
MAX_SOURCE_BYTES = 256 * 1024
MAX_OUTPUT_CHARS = 20_000
COMPILE_TIMEOUT_SECONDS = 10
RUN_TIMEOUT_SECONDS = 5


def _process_result(command, cwd, timeout, env):
    started = time.perf_counter()
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        shell=False,
        creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        start_new_session=os.name != "nt",
    )
    captured = {"stdout": [], "stderr": []}

    def drain(stream, key):
        while True:
            chunk = stream.read(4096)
            if not chunk:
                return
            used = sum(map(len, captured[key]))
            if used < MAX_OUTPUT_CHARS:
                captured[key].append(chunk[:MAX_OUTPUT_CHARS - used])

    readers = [
        threading.Thread(target=drain, args=(process.stdout, "stdout"), daemon=True),
        threading.Thread(target=drain, args=(process.stderr, "stderr"), daemon=True),
    ]
    for reader in readers:
        reader.start()

    timed_out = False
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        if os.name == "nt":
            taskkill = Path(env.get("SYSTEMROOT", r"C:\Windows")) / "System32" / "taskkill.exe"
            try:
                subprocess.run([str(taskkill), "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3, check=False)
            except (OSError, subprocess.TimeoutExpired):
                process.kill()
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.wait()

    for reader in readers:
        reader.join(timeout=2)
    return {
        "returncode": process.returncode,
        "stdout": "".join(captured["stdout"]),
        "stderr": "".join(captured["stderr"]),
        "timed_out": timed_out,
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def _execute_source(filename: str, source: bytes):
    suffix = Path(filename).suffix.lower()
    try:
        text = source.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise HTTPException(status_code=400, detail="Source file must be UTF-8 text.") from error

    with tempfile.TemporaryDirectory(prefix="cpu-simulator-run-") as temp_dir:
        work_dir = Path(temp_dir)
        source_path = work_dir / f"program{suffix}"
        source_path.write_text(text, encoding="utf-8")
        env = {key: value for key, value in os.environ.items() if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "PATHEXT"}}
        if "PATH" not in env:
            env["PATH"] = os.defpath

        if suffix == ".py":
            command = [sys.executable, "-I", str(source_path)]
        else:
            compiler_name = "gcc" if suffix == ".c" else "g++"
            compiler = shutil.which(compiler_name, path=env.get("PATH"))
            if not compiler:
                raise HTTPException(status_code=503, detail=f"{compiler_name} is not installed or is not on PATH.")
            executable_name = "program.exe" if os.name == "nt" else "program"
            executable_path = work_dir / executable_name
            command = [compiler, str(source_path), "-o", str(executable_path)]
            compiled = _process_result(command, work_dir, COMPILE_TIMEOUT_SECONDS, env)
            if compiled["timed_out"]:
                return {"ok": False, "phase": "compile", "timed_out": True, "runtime_ms": compiled["elapsed_ms"], "stdout": compiled["stdout"], "stderr": compiled["stderr"]}
            if compiled["returncode"] != 0:
                return {"ok": False, "phase": "compile", "timed_out": False, "runtime_ms": compiled["elapsed_ms"], "stdout": compiled["stdout"], "stderr": compiled["stderr"], "exit_code": compiled["returncode"]}
            command = [str(executable_path)]

        result = _process_result(command, work_dir, RUN_TIMEOUT_SECONDS, env)
        return {
            "ok": result["returncode"] == 0 and not result["timed_out"],
            "phase": "run",
            "timed_out": result["timed_out"],
            "runtime_ms": result["elapsed_ms"],
            "stdout": result["stdout"],
            "stderr": result["stderr"],
            "exit_code": result["returncode"],
        }


@router.post("/run")
async def run_program(
    request: Request,
    filename: str = Query(..., min_length=1, max_length=255),
):
    """Run trusted local source; this endpoint only accepts loopback clients."""
    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Program execution is available only from this computer.")

    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in {
        str(request.base_url).rstrip("/"),
        f"http://localhost:{request.url.port or 80}",
        f"https://localhost:{request.url.port or 443}",
    }:
        raise HTTPException(status_code=403, detail="Cross-site program execution requests are not allowed.")

    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()
    if safe_name != filename or suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Choose a .py, .c, .cc, .cpp, or .cxx source file.")

    source = await request.body()
    if not source:
        raise HTTPException(status_code=400, detail="The selected source file is empty.")
    if len(source) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="Source files must be 256 KB or smaller.")

    result = await run_in_threadpool(_execute_source, safe_name, source)
    return {"filename": safe_name, **result}
