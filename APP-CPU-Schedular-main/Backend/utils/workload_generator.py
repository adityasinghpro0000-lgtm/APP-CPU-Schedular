"""
Workload generator utility module.
"""

import math
import random
from typing import List

# Use absolute imports
from schemas.workload import Process

# Color palette matching frontend
PALETTE = ['#506db0', '#d9795f', '#5d906e', '#9a7ab4', '#c18d4b', '#608d98', '#b05076', '#7ab450']


def poisson_sample(lam: float) -> int:
    """Generate a Poisson-distributed sample."""
    if lam <= 0:
        return 0
    L = math.exp(-lam)
    k = 0
    p = 1
    while p > L:
        k += 1
        p *= random.random()
    return max(0, k - 1)


def exponential_sample(rate: float) -> float:
    """Generate an exponentially distributed sample."""
    if rate <= 0:
        return 0
    return -math.log(random.random()) / rate


def generate_workload(
    count: int,
    distribution: str,
    lam: float,
    max_burst: int
) -> List[Process]:
    """Generate synthetic CPU scheduling workload.
    
    Args:
        count: Number of processes to generate (1-20)
        distribution: Type of distribution (uniform, poisson, exponential)
        lam: Lambda parameter for distribution
        max_burst: Maximum burst time
        
    Returns:
        List of Process objects
    """
    processes = []
    clock = 0
    
    for i in range(count):
        # Arrival time generation
        if distribution == 'poisson':
            gap = max(0, int(exponential_sample(1 / lam)))
            burst = max(1, min(max_burst, int(exponential_sample(1 / max(lam * 2, 0.1)))))
        elif distribution == 'exponential':
            gap = round(exponential_sample(1 / lam))
            burst = max(1, min(max_burst, round(exponential_sample(2 / max_burst))))
        else:  # uniform
            gap = random.randrange(max(1, round(lam)))
            burst = random.randint(1, max_burst)
        
        clock += gap
        processes.append(Process(
            id=f"P{i+1}",
            arrival=clock,
            burst=burst,
            priority=random.randint(1, 5),
            deadline=clock + burst + random.randint(3, 12),
            color=PALETTE[i % len(PALETTE)],
            state='Ready'
        ))
    
    return processes


def normalize_imported_processes(items: list) -> List[Process]:
    """Normalize imported process data.
    
    Args:
        items: List of process dictionaries
        
    Returns:
        List of normalized Process objects
    """
    if not isinstance(items, list) or not items:
        raise ValueError('No processes found')
    
    seen = set()
    processes = []
    
    for index, item in enumerate(items):
        # Extract fields with fallbacks
        pid = str(item.get('id') or item.get('PID') or f'P{index + 1}').strip()
        arrival = int(item.get('arrival') or item.get('AT') or 0)
        burst = int(item.get('burst') or item.get('BT') or 0)
        priority = int(item.get('priority') or item.get('Priority') or 1)
        
        # Validation
        if not pid or pid in seen or arrival < 0 or burst < 1:
            raise ValueError(f'Invalid process at row {index + 1}')
        
        seen.add(pid)
        
        deadline = int(item.get('deadline') or item.get('Deadline') or 0)
        if deadline < 1:
            deadline = arrival + burst + 10
        
        processes.append(Process(
            id=pid,
            arrival=arrival,
            burst=burst,
            priority=priority,
            deadline=deadline,
            color=PALETTE[index % len(PALETTE)],
            state='Ready'
        ))
    
    return processes


def parse_csv(text: str) -> list:
    """Parse CSV text into list of dictionaries.
    
    Args:
        text: CSV content as string
        
    Returns:
        List of dictionaries with headers as keys
    """
    lines = text.strip().split('\n')
    lines = [line for line in lines if line]  # Remove empty lines
    
    if len(lines) < 2:
        raise ValueError('CSV needs a header and at least one process')
    
    headers = lines[0].split(',')
    headers = [h.strip() for h in headers]
    
    processes = []
    for line in lines[1:]:
        values = line.split(',')
        process = {}
        for i, header in enumerate(headers):
            if i < len(values):
                process[header] = values[i].strip()
            else:
                process[header] = ''
        processes.append(process)
    
    return processes