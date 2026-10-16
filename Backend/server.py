"""
Server entry point for CPU Scheduling Simulator.
Supports both FastAPI backend and legacy Python HTTP server.
"""

import os
import sys
from pathlib import Path

# Add backend directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Determine if we should use FastAPI or legacy server
USE_FASTAPI = os.getenv("USE_FASTAPI", "true").lower() in ("true", "1", "yes")

if USE_FASTAPI:
    # Import and run FastAPI app
    from main import app
    
    if __name__ == "__main__":
        import uvicorn
        
        host = os.getenv("HOST", "127.0.0.1")
        port = int(os.getenv("PORT", "8000"))
        reload = os.getenv("DEBUG", "false").lower() in ("true", "1")
        
        print(f"CPU Scheduling Simulator (FastAPI): http://{host}:{port}/")
        print(f"API Docs: http://{host}:{port}/docs")
        uvicorn.run(app, host=host, port=port, reload=reload)
else:
    # Legacy server implementation
    from http.server import HTTPServer, SimpleHTTPRequestHandler
    from urllib.parse import parse_qs, urlparse
    import json
    import random
    
    ROOT = Path(__file__).resolve().parents[1] / 'Frontend'
    PALETTE = ['#506db0', '#d9795f', '#5d906e', '#9a7ab4', '#c18d4b', '#608d98', '#b05076', '#7ab450']
    
    def sample_workload(query: dict) -> list:
        count = max(1, min(20, int(query.get('count', ['5'])[0])))
        distribution = query.get('distribution', ['uniform'])[0]
        lam = max(0.1, float(query.get('lambda', ['2'])[0]))
        max_burst = max(1, int(query.get('maxBurst', ['8'])[0]))
        clock = 0
        processes = []
        for index in range(count):
            if distribution == 'poisson':
                gap = max(0, int(random.expovariate(1 / lam)))
                burst = max(1, min(max_burst, int(random.expovariate(1 / max(lam * 2, 0.1)))))
            elif distribution == 'exponential':
                gap = round(random.expovariate(1 / lam))
                burst = max(1, min(max_burst, round(random.expovariate(2 / max_burst))))
            else:
                gap = random.randrange(max(1, round(lam)))
                burst = random.randint(1, max_burst)
            clock += gap
            processes.append({
                'id': f'P{index + 1}', 'arrival': clock, 'burst': burst,
                'priority': random.randint(1, 5), 'deadline': clock + burst + random.randint(3, 12),
                'color': PALETTE[index % len(PALETTE)], 'state': 'Ready',
            })
        return processes
    
    class SimulatorHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            request = urlparse(self.path)
            if request.path == '/api/workload':
                payload = json.dumps(sample_workload(parse_qs(request.query))).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            super().do_GET()
    
    if __name__ == '__main__':
        os.chdir(ROOT)
        server = HTTPServer(('127.0.0.1', 8000), SimulatorHandler)
        print('CPU Scheduling Simulator: http://127.0.0.1:8000/')
        server.serve_forever()