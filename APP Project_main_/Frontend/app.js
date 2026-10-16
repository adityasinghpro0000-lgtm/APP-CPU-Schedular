'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const PALETTE = ['#506db0','#d9795f','#5d906e','#9a7ab4','#c18d4b','#608d98','#b05076','#7ab450','#a06050','#5090b0'];

const DEFAULT_PROCESSES = [
  { id:'P1', arrival:0, burst:5, priority:2, deadline:10, color:'#506db0', state:'Ready' },
  { id:'P2', arrival:1, burst:3, priority:1, deadline:7,  color:'#d9795f', state:'Ready' },
  { id:'P3', arrival:2, burst:8, priority:3, deadline:20, color:'#5d906e', state:'Ready' },
  { id:'P4', arrival:3, burst:2, priority:2, deadline:8,  color:'#9a7ab4', state:'Ready' },
  { id:'P5', arrival:4, burst:4, priority:1, deadline:15, color:'#c18d4b', state:'Ready' },
];

const ALGO_META = {
  fcfs:        { name:'FCFS',          fullName:'First Come, First Served',                  type:'NON-PREEMPTIVE', formula:'min(arrival time)',        desc:'Processes execute in arrival order. Simple and predictable but long processes block shorter ones — the convoy effect.' },
  sjf:         { name:'SJF',           fullName:'Shortest Job First',                        type:'NON-PREEMPTIVE', formula:'min(burst time)',           desc:'The process with the shortest total burst runs next. Minimises average waiting time but may indefinitely starve long processes.' },
  srtf:        { name:'SRTF',          fullName:'Shortest Remaining Time First',             type:'PREEMPTIVE',     formula:'min(remaining time)',      desc:'Preemptive SJF. If a new arrival has less remaining time than the current process, it preempts immediately. Optimal average WT.' },
  rr:          { name:'Round Robin',   fullName:'Round Robin',                               type:'PREEMPTIVE',     formula:'circular queue × Q',      desc:'Each process receives a fixed time quantum Q in a circular order. Fair and starvation-free. Performance is sensitive to Q size.' },
  priority_np: { name:'Priority (NP)', fullName:'Priority Scheduling (Non-Preemptive)',      type:'NON-PREEMPTIVE', formula:'max priority value',       desc:'Highest-priority available process runs until it finishes. Lower-priority processes may starve without aging.' },
  priority_p:  { name:'Priority (P)',  fullName:'Priority Scheduling (Preemptive)',          type:'PREEMPTIVE',     formula:'max priority value',       desc:'If a newly arrived process has higher priority than the running one, it immediately preempts it. Very responsive to high-priority tasks.' },
  mlfq:        { name:'MLFQ',          fullName:'Multi-Level Feedback Queue',                type:'PREEMPTIVE',     formula:'highest non-empty queue',  desc:'Processes start in Q0 (short quantum) and are demoted if they use their full quantum. Anti-starvation aging periodically boosts waiting processes.' },
  edf:         { name:'EDF',           fullName:'Earliest Deadline First',                   type:'PREEMPTIVE',     formula:'min(deadline − clock)',    desc:'Real-time scheduling. Always runs the process with the nearest absolute deadline. Theoretically optimal for meeting all deadlines on a single CPU.' },
  cfs:         { name:'CFS',           fullName:'Completely Fair Scheduler (Linux)',         type:'PREEMPTIVE',     formula:'min(vruntime)',            desc:'Tracks virtual runtime (vruntime) per process and always schedules the one with the least accumulated CPU time. Mimics Linux\'s production scheduler.' },
};

// ============================================================
// STATE
// ============================================================
let processes   = DEFAULT_PROCESSES.map(p => ({ ...p }));
let jobs        = [];
let lastResult  = null;
let allSnaps    = [];
let snapIdx     = 0;
let playTimer   = null;
let compData    = null;
let ganttViewMode  = 'dual';   // 'dual' | 'cpu' | 'swimlane'
let ganttScaleMode = 'normal'; // 'fit' | 'normal' | 'expanded'
const WSKEY_BASE = 'cpu-sim-ws-v3';

function readStoredValue(key) {
  try { return localStorage.getItem(key); } catch (error) {
    console.warn(`Could not read browser storage (${key}):`, error);
    return null;
  }
}

function writeStoredValue(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (error) {
    console.warn(`Could not save browser storage (${key}):`, error);
    return false;
  }
}

function profileSettingKey(key) {
  if (new URLSearchParams(window.location.search).get('demo') === '1') return `${key}-demo`;
  const profileId = window.ProfileManager?.getStorageScope?.() || 'default';
  return `${key}-${profileId}`;
}

function workspaceStorageKey() {
  if (new URLSearchParams(window.location.search).get('demo') === '1') return `${WSKEY_BASE}-demo`;
  let profileId = 'default';
  try { profileId = window.ProfileManager?.getStorageScope?.() || profileId; } catch (error) {
    console.warn('Could not read the active profile; using the default scope.', error);
  }
  const workspaceId = readStoredValue(`cpu-simulator-active-workspace-${profileId}`) || 'welcome';
  return `${WSKEY_BASE}-${profileId}-${workspaceId}`;
}

// ============================================================
// DOM
// ============================================================
const $  = id => document.getElementById(id);
function enableTerminalDragging() {
  const panel = $('programRunOutputPanel');
  const handle = panel?.querySelector('.terminal-titlebar');
  if (!panel || !handle) return;
  panel.querySelector('.terminal-window-actions')?.remove();
  const screen = panel.querySelector('.terminal-screen');
  if (screen && !screen.querySelector('.terminal-help')) {
    const help = document.createElement('div');
    help.className = 'terminal-help';
    help.textContent = 'Enter  -  start or resume playback\nAny other key  -  stop playback (focus the prompt first)\nTitle bar  -  drag to move the terminal\nGantt controls  -  step or seek through the run\nOutput  -  process completion log';
    screen.insertBefore(help, screen.querySelector('.terminal-command-line'));
    const output = $('programRunOutput');
    if (output && output.textContent.startsWith('Press Enter')) output.textContent = 'Ready.';
  }
  panel.querySelector('.terminal-screen')?.addEventListener('pointerdown', event => {
    if (event.target.id !== 'terminalCommand') $('terminalCommand')?.focus();
  });

  let drag = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    panel.classList.add('is-floating');
    panel.style.left = `${rect.left + window.scrollX}px`;
    panel.style.top = `${rect.top + window.scrollY}px`;
    panel.style.width = `${rect.width}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    drag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const maxLeft = Math.max(0, document.documentElement.scrollWidth - panel.offsetWidth);
    const maxTop = Math.max(0, document.documentElement.scrollHeight - panel.offsetHeight);
    panel.style.left = `${Math.min(maxLeft, Math.max(0, event.clientX + window.scrollX - drag.dx))}px`;
    panel.style.top = `${Math.min(maxTop, Math.max(0, event.clientY + window.scrollY - drag.dy))}px`;
  });

  const stopDragging = event => {
    if (drag && event.pointerId === drag.pointerId) drag = null;
  };
  handle.addEventListener('pointerup', stopDragging);
  handle.addEventListener('pointercancel', stopDragging);
}
enableTerminalDragging();
const algoSel  = $('algorithm');
const quantumIn = $('quantum');
const csIn      = $('contextSwitch');
const priConvIn = $('priorityConvention');
const presetSel = $('preset');
const themeBtn  = $('themeToggle');
const motionBtn = $('motionToggle');

// ============================================================
// UTILITIES
// ============================================================
function getColor(pid) {
  const p = processes.find(x => x.id === pid);
  if (p?.color) return p.color;
  const i = processes.findIndex(x => x.id === pid);
  return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
}
function stateClass(s) {
  s = String(s || '').toLowerCase();
  if (s.includes('run'))                                    return 'running';
  if (s.includes('terminat') || s.includes('complet'))     return 'completed';
  if (s.includes('wait') || s.includes('block'))           return 'waiting';
  if (s.includes('new'))                                   return 'new';
  return 'ready';
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

// Stochastic helpers (pure JS)
function poissonSample(lam) {
  if (lam <= 0) return 0;
  const L = Math.exp(-lam); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.max(0, k - 1);
}
function exponentialSample(rate) {
  return rate > 0 ? -Math.log(Math.random()) / rate : 0;
}

// ============================================================
// SIMULATION ENGINE  (tick-by-tick, all 9 algorithms)
// ============================================================
function simulate(procs, algo, opts = {}) {
  const Q      = Math.max(1, opts.Q  || 2);
  const CS     = Math.max(0, opts.CS || 0);
  const priMul = opts.priDir === 'higher' ? -1 : 1;   // lower number = higher priority by default
  const mlfqQ  = opts.mlfqQ || [2, 4, 8];             // quanta per MLFQ level

  // ── PCB initialisation ──────────────────────────────────
  const pcbs = procs.map(p => ({
    ...p,
    jobId:          p.jobId || p.id,
    submittedAt:    p.submittedAt !== undefined ? p.submittedAt : p.arrival,
    admittedAt:     p.admittedAt !== undefined ? p.admittedAt : p.arrival,
    policy:         p.policy || null,
    remaining:      p.burst,
    // Count simulated instruction units executed by this process.
    programCounter:  0,
    state:          'New',
    responseTime:   null,
    completionTime: null,
    turnaroundTime: null,
    waitingTime:    null,
    vruntime:       0,
    queueLevel:     0,
    quantumUsed:    0,
    ageCounter:     0,
    history:        [], // tick-by-tick state for accurate lifecycle swimlanes
  }));

  // FIFO queues for RR / MLFQ  (other algos use readyPool())
  const fifoQ = mlfqQ.map(() => []);

  // ── Helpers ─────────────────────────────────────────────
  const readyPool   = () => pcbs.filter(p => p.state === 'Ready');
  const allDone     = () => pcbs.every(p => p.state === 'Terminated');

  function arrive() {
    const arriving = pcbs.filter(p => p.state === 'New' && p.arrival <= clock);
    arriving.forEach(p => {
      p.state = 'Ready';
      fifoQ[p.queueLevel || 0].push(p);
    });
    return arriving.length > 0;
  }

  function dequeue(pcb) {
    for (const q of fifoQ) { const i = q.indexOf(pcb); if (i >= 0) { q.splice(i, 1); return; } }
  }

  function enqueue(pcb) {
    pcb.state = 'Ready';
    fifoQ[pcb.queueLevel || 0].push(pcb);
  }

  function pick() {
    const pool = readyPool();
    if (!pool.length) return null;
    switch (algo) {
      case 'fcfs':        return pool.reduce((b,p) => p.arrival < b.arrival ? p : (p.arrival === b.arrival && p.id < b.id ? p : b));
      case 'sjf':         return pool.reduce((b,p) => p.burst < b.burst ? p : (p.burst === b.burst && p.arrival < b.arrival ? p : b));
      case 'srtf':        return pool.reduce((b,p) => p.remaining < b.remaining ? p : (p.remaining === b.remaining && p.arrival < b.arrival ? p : b));
      case 'rr':          return fifoQ[0][0] || null;
      case 'priority_np': return pool.reduce((b,p) => (p.priority * priMul < b.priority * priMul) ? p : ((p.priority === b.priority && p.arrival < b.arrival) ? p : b));
      case 'priority_p':  return pool.reduce((b,p) => (p.priority * priMul < b.priority * priMul) ? p : ((p.priority === b.priority && p.arrival < b.arrival) ? p : b));
      case 'mlfq':      { for (const q of fifoQ) if (q.length) return q[0]; return null; }
      case 'edf':         return pool.reduce((b,p) => (p.deadline ?? Infinity) < (b.deadline ?? Infinity) ? p : ((p.deadline === b.deadline && p.arrival < b.arrival) ? p : b));
      case 'cfs':         return pool.reduce((b,p) => p.vruntime < b.vruntime ? p : (p.vruntime === b.vruntime && p.arrival < b.arrival ? p : b));
      default:            return pool[0];
    }
  }

  function shouldPreempt() {
    if (!current) return false;
    const pool = readyPool();
    if (!pool.length) return false;
    switch (algo) {
      case 'fcfs': case 'sjf': case 'priority_np': return false;
      case 'rr':          return current.quantumUsed >= Q;
      case 'srtf':        return pool.some(p => p.remaining < current.remaining);
      case 'priority_p':  return pool.some(p => p.priority * priMul < current.priority * priMul);
      case 'mlfq': {
        for (let q = 0; q < current.queueLevel; q++) if (fifoQ[q].length) return true;
        return current.quantumUsed >= mlfqQ[current.queueLevel];
      }
      case 'edf':  return pool.some(p => (p.deadline ?? Infinity) < (current.deadline ?? Infinity));
      case 'cfs':  return pool.some(p => p.vruntime < current.vruntime);
      default:     return false;
    }
  }

  // ── Gantt helpers ────────────────────────────────────────
  const gantt = [];
  function addGanttTick(id, type) {
    const last = gantt[gantt.length - 1];
    if (last && last.id === id && last.type === type && last.end === clock) {
      last.end = clock + 1;
    } else {
      gantt.push({ id, type, start: clock, end: clock + 1 });
    }
  }

  // ── History & Snapshot helper ────────────────────────────
  function recordTickHistory(ranId, isCS) {
    pcbs.forEach(p => {
      let st;
      if (p.state === 'Terminated') {
        st = 'terminated';
      } else if (isCS && (p.id === prevId || p.id === (current ? current.id : null))) {
        st = 'cs';
      } else if (p.id === ranId) {
        st = 'running';
      } else if (clock < (p.submittedAt ?? p.arrival)) {
        st = 'unsubmitted';
      } else if (clock < (p.admittedAt ?? p.arrival)) {
        st = 'job_pool';
      } else if (p.state === 'Ready') {
        st = 'ready';
      } else {
        st = 'new';
      }
      p.history[clock] = st;
    });
  }

  const snapshots = [];
  function takeSnap(runId) {
    const pool  = readyPool();
    const rq = algo === 'mlfq'
      ? fifoQ.flatMap((q, i) => q.map(p => ({ id: p.id, remaining: p.remaining, priority: p.priority, queueLevel: i })))
      : pool.map(p => ({ id: p.id, remaining: p.remaining, priority: p.priority }));
    snapshots.push({
      clock,
      running:      runId || null,
      readyQueue:   rq,
      processStates: new Map(pcbs.map(p => [
        p.id,
        p.id === runId && p.state !== 'Terminated' ? 'Running' : p.state,
      ])),
      programCounters: new Map(pcbs.map(p => [p.id, p.programCounter])),
    });
  }

  // ── MLFQ anti-starvation aging ───────────────────────────
  function ageMlfq() {
    for (let qi = 1; qi < fifoQ.length; qi++) {
      fifoQ[qi].forEach(p => {
        p.ageCounter++;
        if (p.ageCounter >= 20) {
          dequeue(p);
          p.queueLevel = Math.max(0, p.queueLevel - 1);
          p.ageCounter = 0;
          enqueue(p);
        }
      });
    }
  }

  // ── Main loop ────────────────────────────────────────────
  let clock   = 0;
  let current = null;
  let prevId  = null;
  let csLeft  = 0;
  let skipNextCSCheck = false;
  const totalBurst = procs.reduce((sum, process) => sum + process.burst, 0);
  const latestArrival = procs.reduce((latest, process) => Math.max(latest, process.arrival), 0);
  const MAXCLOCK = latestArrival + totalBurst * (CS + 1) + 100;

  // Capture the initial lifecycle state before t=0 arrivals enter the ready queue.
  takeSnap(null);

  while (clock < MAXCLOCK) {
    if (allDone()) break;

    if (arrive()) takeSnap(current ? current.id : null);

    // ── Context-switch drain ──────────────────────────────
    if (csLeft > 0) {
      csLeft--;
      addGanttTick('CS', 'cs');
      recordTickHistory(null, true);
      takeSnap(null);
      clock++;
      if (csLeft === 0) skipNextCSCheck = true;
      continue;
    }

    // ── Preemption check ─────────────────────────────────
    if (current && shouldPreempt()) {
      current.state = 'Ready';
      if (algo === 'rr') {
        current.quantumUsed = 0;
        enqueue(current);
      } else if (algo === 'mlfq') {
        if (current.quantumUsed >= mlfqQ[current.queueLevel]) {
          current.queueLevel = Math.min(current.queueLevel + 1, fifoQ.length - 1);
          current.quantumUsed = 0;
        }
        enqueue(current);
      }
      current = null;
      if (CS > 0 && prevId !== null) {
        csLeft = CS;
        continue;
      }
    }

    // ── Pick next ─────────────────────────────────────────
    if (!current) {
      const cand = pick();
      if (!cand) {
        addGanttTick('IDLE', 'idle');
        recordTickHistory(null, false);
        takeSnap(null);
        clock++;
        continue;
      }
      // Context switch on process change
      if (skipNextCSCheck) {
        skipNextCSCheck = false;
      } else if (CS > 0 && prevId && prevId !== cand.id) {
        csLeft = CS;
        continue;
      }
      current = cand;
      dequeue(current);
      current.state     = 'Running';
      if (current.responseTime === null) current.responseTime = clock - current.arrival;
    }

    // ── Execute 1 tick ────────────────────────────────────
    prevId = current.id;
    current.programCounter++;
    current.remaining--;
    current.quantumUsed++;
    current.vruntime++;

    addGanttTick(current.id, 'cpu');
    if (algo === 'mlfq') ageMlfq();

    recordTickHistory(current.id, false);

    // Completion check
    let ranId = current.id;
    if (current.remaining <= 0) {
      current.state          = 'Terminated';
      current.completionTime = clock + 1;
      current.turnaroundTime = current.completionTime - current.arrival;
      current.waitingTime    = current.turnaroundTime - current.burst;
      current = null;
      prevId  = null;
    }

    takeSnap(ranId);
    clock++;
  }

  // ── Construct Long-Term Job Scheduling Track (jobGantt) ────
  const jobGantt = buildJobGantt(pcbs, opts.jobs || jobs, clock);

  return { gantt, jobGantt, snapshots, pcbs, makespan: clock };
}

// ============================================================
// METRICS
// ============================================================
function calcMetrics(pcbs) {
  const done = pcbs.filter(p => p.state === 'Terminated');
  if (!done.length) return null;
  const totalBurst = pcbs.reduce((s, p) => s + p.burst, 0);
  const makespan   = Math.max(...done.map(p => p.completionTime));
  const workloadStart = Math.min(...pcbs.map(p => p.arrival));
  const workloadDuration = makespan - workloadStart;
  return {
    avgWT:        done.reduce((s, p) => s + p.waitingTime,    0) / done.length,
    avgTAT:       done.reduce((s, p) => s + p.turnaroundTime, 0) / done.length,
    avgRT:        done.reduce((s, p) => s + (p.responseTime ?? 0), 0) / done.length,
    avgJobWT:     done.reduce((s, p) => s + Math.max(0, (p.admittedAt ?? p.arrival) - (p.submittedAt ?? p.arrival)), 0) / done.length,
    avgTotalTAT:  done.reduce((s, p) => s + ((p.completionTime ?? makespan) - (p.submittedAt ?? p.arrival)), 0) / done.length,
    utilization:  workloadDuration > 0 ? (totalBurst / workloadDuration) * 100 : 0,
    throughput:   makespan ? done.length / makespan : 0,
    makespan,
  };
}

// ============================================================
// RENDER — process table
// ============================================================
function renderTable() {
  const tbody    = $('processTable');
  const showDL   = algoSel.value === 'edf';
  const processStates = allSnaps[snapIdx]?.processStates;
  tbody.innerHTML = processes.map((p, i) => `
    <tr>
      <td><input class="process-color-input" type="color" value="${p.color || PALETTE[i % PALETTE.length]}" data-index="${i}" data-field="color" aria-label="${p.id} color"></td>
      <td><div class="process-name-cell"><input class="process-input process-name" type="text" value="${p.id}" data-index="${i}" data-field="id" aria-label="${p.id} name"${p.sourceFile ? ' readonly title="Program file process names cannot be changed"' : ''}>${p.sourceFile ? `<small class="process-source-file" title="${escapeHTML(p.sourceFile)}">${escapeHTML(p.sourceFile)}</small>` : ''}</div></td>
      <td><input class="process-input"             type="number" value="${p.arrival}"  data-index="${i}" data-field="arrival"  min="0"  aria-label="${p.id} arrival"></td>
      <td><input class="process-input"             type="number" value="${p.burst}"    data-index="${i}" data-field="burst"    min="1"  aria-label="${p.id} burst"></td>
      <td><input class="process-input"             type="number" value="${p.priority}" data-index="${i}" data-field="priority" min="1"  aria-label="${p.id} priority"></td>
      <td class="deadline-col${showDL ? '' : ' hidden'}"><input class="process-input" type="number" value="${p.deadline || ''}" data-index="${i}" data-field="deadline" min="1" placeholder="—" aria-label="${p.id} deadline"></td>
      <td><span class="state-pill ${stateClass(processStates?.get(p.id) || p.state)}">${processStates?.get(p.id) || p.state || 'Ready'}</span></td>
      <td><button class="delete-button" data-remove="${i}" aria-label="Remove ${p.id}"><i data-lucide="trash-2"></i></button></td>
    </tr>`).join('');
  document.querySelectorAll('.deadline-header').forEach(h => h.classList.toggle('hidden', !showDL));
  $('processCount').textContent  = `${processes.length} process${processes.length === 1 ? '' : 'es'}`;
  $('workloadTotal').textContent = `${processes.reduce((s, p) => s + p.burst, 0)} units`;
  window.lucide?.createIcons?.();
}

function compareJobs(left, right, policy) {
  if (policy === 'sjf' && left.burst !== right.burst) return left.burst - right.burst;
  if (policy === 'priority') {
    const direction = priConvIn.value === 'higher' ? -1 : 1;
    if (left.priority !== right.priority) return (left.priority - right.priority) * direction;
  }
  if (policy === 'edf' && left.deadline !== right.deadline) return left.deadline - right.deadline;
  if (policy === 'fcfs' && left.arrival !== right.arrival) return left.arrival - right.arrival;
  return left.arrival - right.arrival || left.queueOrder - right.queueOrder;
}

function renderJobQueue() {
  const policy = $('jobPolicy').value;
  const queuedJobs = jobs.map((job, queueOrder) => ({ ...job, queueOrder })).sort((left, right) => compareJobs(left, right, policy));
  const pendingPrograms = programFilesPrepared
    ? selectedProgramFiles.filter(file => !processes.some(process => process.sourceFile === file.name))
    : selectedProgramFiles;
  $('jobTable').innerHTML = queuedJobs.map(job => `
    <tr>
      <td><strong>${job.id}</strong></td><td>${job.arrival}</td><td>${job.burst}</td>
      <td>${job.priority}</td><td>${job.deadline}</td>
      <td><button type="button" class="delete-button job-delete-button" data-job-remove="${job.id}" aria-label="Remove job ${job.id}" title="Remove job ${job.id}"><i data-lucide="trash-2"></i><span>Remove</span></button></td>
    </tr>`).join('') + pendingPrograms.map(file => `
    <tr class="program-job-pending">
      <td><strong>${escapeHTML(file.name)}</strong><small>Program job · pending measurement</small></td>
      <td>0</td><td>Unmeasured</td><td>1</td><td>—</td><td>Run with Gantt Play</td>
    </tr>`).join('');
  const totalQueued = jobs.length + pendingPrograms.length;
  $('jobQueueCount').textContent = `${totalQueued} queued job${totalQueued === 1 ? '' : 's'}`;
  window.lucide?.createIcons?.();
}

function admitJobsToCpu() {
  if (!jobs.length) return;
  const policy = $('jobPolicy').value;
  const admissionTime = Math.max(0, Number($('jobAdmissionTime').value) || 0);
  const capacity = clamp(Math.floor(Number($('jobCapacity').value) || 1), 1, 20);
  const admitted = jobs.map((job, queueOrder) => ({ ...job, queueOrder }))
    .filter(job => job.arrival <= admissionTime)
    .sort((left, right) => compareJobs(left, right, policy))
    .slice(0, capacity);
  const status = $('jobSchedulerStatus');
  if (!admitted.length) {
    status.textContent = 'No queued jobs have arrived by the admission time.';
    return;
  }
  admitted.forEach((job, index) => {
    let processNumber = processes.length + 1;
    while (processes.some(process => process.id.toLowerCase() === `p${processNumber}`)) processNumber++;
    processes.push({
      id: `P${processNumber}`,
      arrival: admissionTime,
      burst: job.burst,
      priority: job.priority,
      deadline: job.deadline,
      color: PALETTE[(processes.length + index) % PALETTE.length],
      state: 'New',
      jobId: job.id,
      submittedAt: job.arrival,
      admittedAt: admissionTime,
      policy,
    });
  });
  const admittedIds = new Set(admitted.map(job => job.id));
  jobs = jobs.filter(job => !admittedIds.has(job.id));
  status.textContent = `Admitted ${admitted.length} job${admitted.length === 1 ? '' : 's'} to the CPU queue.`;
  addLog(`Admitted ${admitted.length} job${admitted.length === 1 ? '' : 's'} to the CPU queue using ${policy.toUpperCase()}`);
  renderJobQueue();
  renderTable();
  updateNavCount();
  snapIdx = 0;
  runSim();
}

// ============================================================
// GANTT & SCHEDULING HELPERS (JOB & PROCESS ACCURACY)
// ============================================================
function buildJobGantt(pcbs, currentJobs, makespan) {
  const jobBlocks = [];
  const M = Math.max(1, makespan);

  // 1. For each admitted process:
  pcbs.forEach(p => {
    const sub = p.submittedAt !== undefined ? p.submittedAt : p.arrival;
    const adm = p.admittedAt !== undefined ? p.admittedAt : p.arrival;
    const comp = p.completionTime !== null ? p.completionTime : M;

    // If there was an admission delay (waiting in job pool):
    if (adm > sub) {
      jobBlocks.push({
        id: p.jobId || p.id,
        procId: p.id,
        type: 'job_pool',
        start: sub,
        end: adm,
        policy: p.policy || 'Long-Term',
        desc: `Job ${p.jobId || p.id} queued in Job Pool (${adm - sub}u admission latency before entering Ready Queue)`,
      });
    }

    // Active admission lifespan (from admission until finish):
    jobBlocks.push({
      id: p.jobId || p.id,
      procId: p.id,
      type: 'job_admitted',
      start: adm,
      end: comp,
      policy: p.policy || null,
      desc: `Job ${p.jobId || p.id} admitted as ${p.id} at t=${adm} (Executing/Waiting in CPU subsystem until t=${comp})`,
    });
  });

  // 2. For unadmitted jobs in the Long-Term Scheduler panel:
  if (Array.isArray(currentJobs)) {
    const admittedJobIds = new Set(pcbs.map(p => p.jobId));
    currentJobs.forEach(j => {
      if (!admittedJobIds.has(j.id)) {
        jobBlocks.push({
          id: j.id,
          procId: null,
          type: 'job_pool',
          start: j.arrival,
          end: Math.max(M, j.arrival + 1),
          policy: 'Pending',
          desc: `Job ${j.id} pending in Job Pool (Waiting for long-term scheduler batch admission)`,
        });
      }
    });
  }

  jobBlocks.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return jobBlocks;
}

function getProcessIntervals(p, totalClock) {
  const intervals = [];
  const total = p.completionTime !== null ? Math.max(totalClock, p.completionTime) : totalClock;
  let curState = null;
  let curStart = 0;

  for (let t = 0; t <= total; t++) {
    const st = t < total
      ? (p.history && p.history[t] ? p.history[t] : (p.completionTime !== null && t >= p.completionTime ? 'terminated' : (t < p.arrival ? 'unsubmitted' : 'ready')))
      : 'end';

    if (st !== curState) {
      if (curState && curState !== 'unsubmitted' && curState !== 'new' && curState !== 'terminated') {
        intervals.push({ state: curState, start: curStart, end: t });
      }
      curState = st;
      curStart = t;
    }
  }
  return intervals;
}

// ============================================================
// RENDER — Gantt Chart (Job & Process Dual-Tier)
// ============================================================
function renderGantt(gantt, hlClock = null) {
  const cpuTrackEl   = $('timeline');
  const jobTrackEl   = $('jobTimeline');
  const swimlanesEl  = $('ganttSwimlanes');
  const axisEl       = $('timelineAxis');
  const canvasEl     = $('ganttCanvas');
  const playheadEl   = $('ganttPlayhead');
  const playheadPill = $('ganttPlayheadPill');
  const totalTimeEl  = $('totalTime');
  const jobCountEl   = $('jobTrackCount');

  if (!gantt?.length) {
    if (cpuTrackEl)  cpuTrackEl.innerHTML  = '';
    if (jobTrackEl)  jobTrackEl.innerHTML  = '';
    if (swimlanesEl) swimlanesEl.innerHTML = '';
    if (axisEl)      axisEl.innerHTML      = '';
    if (totalTimeEl) totalTimeEl.textContent = '0 units';
    if (jobCountEl) jobCountEl.textContent = '0 jobs';
    if (playheadEl)  playheadEl.classList.add('hidden');
    return;
  }

  const pcbs     = lastResult?.pcbs || [];
  const jobGantt = lastResult?.jobGantt || [];
  const total    = Math.max(
    ...gantt.map(b => b.end),
    ...jobGantt.map(b => b.end),
    ...pcbs.map(p => p.completionTime || 0),
    ...pcbs.map(p => p.deadline || 0),
    1
  );

  // Apply responsive / pixel canvas scaling
  if (canvasEl) {
    if (ganttScaleMode === 'fit') {
      canvasEl.style.width = '100%';
    } else if (ganttScaleMode === 'expanded') {
      canvasEl.style.width = `${Math.max(680, total * 52)}px`;
    } else {
      canvasEl.style.width = `${Math.max(600, total * 36)}px`;
    }
  }

  if (totalTimeEl) totalTimeEl.textContent = `${total} units`;
  if (jobCountEl) {
    const uniqueJobs = new Set([...pcbs.map(p => p.jobId || p.id), ...(jobs.map(j => j.id))]);
    jobCountEl.textContent = `${uniqueJobs.size} job${uniqueJobs.size === 1 ? '' : 's'}`;
  }

  // Toggle track visibility according to current view tab
  const jobWrapper  = $('jobTrackWrapper');
  const cpuWrapper  = $('cpuTrackWrapper');
  const swimWrapper = $('swimlaneTrackWrapper');
  if (jobWrapper)  jobWrapper.classList.toggle('hidden',  ganttViewMode !== 'dual');
  if (cpuWrapper)  cpuWrapper.classList.toggle('hidden',  ganttViewMode === 'swimlane');
  if (swimWrapper) swimWrapper.classList.toggle('hidden', ganttViewMode !== 'swimlane');

  // 1. RENDER CPU SCHEDULER TRACK (Short-Term Gantt)
  if (cpuTrackEl) {
    cpuTrackEl.innerHTML = gantt.map(b => {
      const dur          = b.end - b.start;
      const leftPct      = (b.start / total) * 100;
      const widthPct     = (dur / total) * 100;
      const idle         = b.type === 'idle';
      const cs           = b.type === 'cs';
      const col          = idle || cs ? '' : getColor(b.id);
      const hl           = hlClock !== null && hlClock >= b.start && hlClock < b.end ? ' hl' : '';
      const isNarrow     = widthPct < 5 ? ' narrow' : '';
      const isVeryNarrow = widthPct < 2.5 ? ' very-narrow' : '';

      return `<div class="timeline-block${idle ? ' idle' : ''}${cs ? ' cs-block' : ''}${hl}${isNarrow}${isVeryNarrow}"
        style="left:${leftPct}%;width:${widthPct}%;${col ? 'background:' + col : ''}"
        data-block-id="${b.id}" data-type="${b.type}" data-start="${b.start}" data-end="${b.end}">
        <span>${b.id}</span>
        <small>${dur}u</small>
      </div>`;
    }).join('');
  }

  // 2. RENDER LONG-TERM JOB SCHEDULER TRACK
  if (jobTrackEl) {
    jobTrackEl.innerHTML = jobGantt.map(b => {
      const dur          = b.end - b.start;
      const leftPct      = (b.start / total) * 100;
      const widthPct     = Math.max(0.5, (dur / total) * 100);
      const isPool       = b.type === 'job_pool';
      const col          = isPool ? '' : getColor(b.procId || b.id);
      const hl           = hlClock !== null && hlClock >= b.start && hlClock < b.end ? ' hl' : '';
      const isNarrow     = widthPct < 6 ? ' narrow' : '';
      const isVeryNarrow = widthPct < 3 ? ' very-narrow' : '';

      return `<div class="timeline-block${isPool ? ' job-pool-block' : ' job-admitted-block'}${hl}${isNarrow}${isVeryNarrow}"
        style="left:${leftPct}%;width:${widthPct}%;${col && !isPool ? 'background:' + col : ''}"
        data-block-id="${b.id}" data-proc-id="${b.procId || ''}" data-type="${b.type}" data-start="${b.start}" data-end="${b.end}">
        <span>${isPool ? b.id + ' (Pool)' : b.id + '→' + (b.procId || '')}</span>
        <small>${dur}u ${isPool ? 'Pool wait' : 'In system'}</small>
      </div>`;
    }).join('');
  }

  // 3. RENDER SWIMLANE MATRIX VIEW (Per-Process & Job Lifecycle)
  if (swimlanesEl) {
    swimlanesEl.innerHTML = pcbs.map(p => {
      const col = p.color || getColor(p.id);
      const intervals = getProcessIntervals(p, total);

      const segmentsMarkup = intervals.map(seg => {
        const dur = seg.end - seg.start;
        if (dur <= 0) return '';
        const leftPct  = (seg.start / total) * 100;
        const widthPct = (dur / total) * 100;
        let segClass   = '';
        let segStyle   = `left:${leftPct}%;width:${widthPct}%;`;
        let text       = dur >= 2 ? `${dur}u` : '';

        if (seg.state === 'running') {
          segClass = 'seg-running';
          segStyle += `background:${col};`;
        } else if (seg.state === 'job_pool') {
          segClass = 'seg-job-pool';
          text     = dur >= 2 ? 'Pool' : '';
        } else if (seg.state === 'ready') {
          segClass = 'seg-ready';
        } else if (seg.state === 'cs') {
          segClass = 'seg-cs';
          text     = 'CS';
        }

        return `<div class="swimlane-seg ${segClass}" style="${segStyle}"
          data-pid="${p.id}" data-state="${seg.state}" data-start="${seg.start}" data-end="${seg.end}">
          ${text}
        </div>`;
      }).join('');

      let deadlineMarkup = '';
      if (p.deadline) {
        const dlPct = (p.deadline / total) * 100;
        const met   = p.completionTime !== null && p.completionTime <= p.deadline;
        deadlineMarkup = `<div class="swimlane-deadline" style="left:${dlPct}%;background:${met ? '#3ea662' : '#e04848'}"
          title="Deadline: t=${p.deadline} (${met ? 'Met' : 'Missed'})"></div>`;
      }

      return `<div class="swimlane-row" data-pid="${p.id}">
        <div class="swimlane-label" title="${p.id} (Job ${p.jobId || p.id})">
          <span class="swimlane-dot" style="background:${col}"></span>
          <span>${p.id}</span>
          <small style="color:var(--muted);font-weight:400">${p.jobId && p.jobId !== p.id ? '('+p.jobId+')' : ''}</small>
        </div>
        <div class="swimlane-track">
          ${segmentsMarkup}
          ${deadlineMarkup}
        </div>
      </div>`;
    }).join('');
  }

  // 4. RENDER SYNCHRONIZED TIME AXIS (Aligned Mathematically)
  if (axisEl) {
    const ticks = new Set([0, total]);
    gantt.forEach(b => { ticks.add(b.start); ticks.add(b.end); });
    jobGantt.forEach(b => { ticks.add(b.start); ticks.add(b.end); });
    pcbs.forEach(p => {
      ticks.add(p.arrival);
      if (p.completionTime) ticks.add(p.completionTime);
      if (p.deadline && p.deadline <= total) ticks.add(p.deadline);
    });

    const step = total <= 25 ? 1 : total <= 50 ? 2 : total <= 100 ? 5 : 10;
    for (let t = 0; t <= total; t += step) {
      ticks.add(t);
    }

    const sortedTicks = [...ticks].sort((a, b) => a - b);
    axisEl.innerHTML = sortedTicks.map(t => {
      const isMajor = t % 5 === 0 || t === 0 || t === total;
      const isActive = hlClock !== null && t === hlClock;
      const leftPct = (t / total) * 100;
      return `<div class="axis-tick${isMajor ? ' major-tick' : ''}${isActive ? ' active' : ''}"
        style="left:${leftPct}%" data-tick="${t}" title="Jump to t = ${t}">
        <div class="axis-tick-line"></div>
        <span class="axis-tick-label">${t}</span>
      </div>`;
    }).join('');
  }

  // 5. UPDATE PLAYHEAD CURSOR
  if (playheadEl && playheadPill) {
    if (hlClock !== null && total > 0) {
      const playPct = clamp((hlClock / total) * 100, 0, 100);
      playheadEl.classList.remove('hidden');
      playheadEl.style.left = `${playPct}%`;
      playheadPill.textContent = `t = ${hlClock}`;
    } else {
      playheadEl.classList.add('hidden');
    }
  }
}

// ============================================================
// RENDER — ready queue / state monitor
// ============================================================
function renderMonitor(snap) {
  const clkEl = $('simClock');
  const runEl = $('runningProcess');
  const mon   = $('readyQueueMonitor');
  if (clkEl) clkEl.textContent = snap ? `t = ${snap.clock}` : 't = —';

  if (runEl) {
    if (snap?.running) {
      const col = getColor(snap.running);
      runEl.innerHTML = `<div class="queue-chip run-chip" style="background:${col};border-color:${col}">
        <span class="chip-id" style="color:#fff">${snap.running}</span>
        <span class="chip-meta">RUNNING</span></div>`;
    } else {
      runEl.innerHTML = '<span class="queue-empty">— idle —</span>';
    }
  }

  if (!mon) return;

  const stateGroups = {
    New: [],
    Running: [],
    Ready: [],
    Waiting: [],
    Terminated: [],
  };

  if (snap?.processStates) {
    for (const [pid, state] of snap.processStates.entries()) {
      const label = String(state || 'Ready');
      if (stateGroups[label]) stateGroups[label].push(pid);
    }
  } else if (snap?.readyQueue) {
    stateGroups.Ready = snap.readyQueue.map(p => p.id);
  }

  const groupMarkup = Object.entries(stateGroups)
    .filter(([, ids]) => ids.length)
    .map(([state, ids]) => {
      const chips = ids.map(pid => {
        const col = getColor(pid);
        const meta = state === 'Terminated' ? 'DONE' : state === 'Waiting' ? 'WAITING' : state === 'New' ? 'NEW' : state.toUpperCase();
        return `<div class="queue-chip" style="border-color:${col}"><span class="chip-id" style="color:${col}">${pid}</span><span class="chip-meta">${meta}</span></div>`;
      }).join('');
      return `<div class="queue-state-group"><div class="queue-state-label">${state}</div><div class="queue-state-items">${chips}</div></div>`;
    })
    .join('');

  mon.innerHTML = groupMarkup || '<span class="queue-empty">Queue empty</span>';
}

function renderPipeline(snap) {
  const stages = $('pipelineStages');
  const windowEl = $('pipelineWindow');
  const clockEl = $('pipelineClock');
  const pcEl = $('programCounterReadout');
  if (!stages || !windowEl) return;
  const monitorReadout = document.querySelector('.monitor-readout');
  if (pcEl) {
    pcEl.setAttribute('aria-label', 'Program counter');
    if (monitorReadout && pcEl.parentElement !== monitorReadout) monitorReadout.appendChild(pcEl);
  }
  const ready = snap?.readyQueue?.map(item => item.id) || [];
  const running = snap?.running || null;
  const active = running || ready[0] || null;
  const decoded = ready[1] || (active && active !== running ? active : null);
  const stageData = [
    ['FETCH', active, 'FETCH'],
    ['DECODE', decoded, 'DECODE'],
    ['EXECUTE', running, 'RUNNING'],
  ];
  stages.innerHTML = stageData.map(([label, pid, meta]) => {
    const color = pid ? getColor(pid) : '';
    return `<div class="pipeline-stage${pid ? ' active' : ''}"${color ? ` style="--stage-color:${color}"` : ''}>
      <span>${label}</span><strong>${pid || '—'}</strong><small>${pid ? meta : 'IDLE'}</small>
    </div>`;
  }).join('');
  if (clockEl) {
    const pc = snap?.running ? snap.programCounters?.get(snap.running) : null;
    clockEl.textContent = snap ? `t = ${snap.clock}` : 't = —';
    if (pcEl) {
      pcEl.textContent = snap?.running ? `PC · ${snap.running}: ${pc ?? 0}` : 'PC · idle';
      pcEl.title = 'Simulated program counter: instruction units executed by the running process';
    }
  }

  const blocks = lastResult?.gantt || [];
  const currentClock = snap?.clock ?? Number.POSITIVE_INFINITY;
  const visible = blocks.filter(block => block.start <= currentClock).slice(-12);
  windowEl.innerHTML = visible.length
    ? visible.map(block => {
      const color = block.id === 'CS' ? '' : getColor(block.id);
      const className = block.id === 'CS' ? ' pipeline-token context' : ' pipeline-token';
      return `<span class="${className.trim()}"${color ? ` style="--token-color:${color}"` : ''} title="${block.id}: t${block.start} to t${block.end}">${block.id}</span>`;
    }).join('')
    : '<span class="queue-empty">Run a simulation to populate the pipeline.</span>';
}

// ============================================================
// RENDER — summary metrics cards
// ============================================================
function renderMetrics(m) {
  if (!m) return;
  const values = {
    avgWaiting: `${m.avgWT.toFixed(2)} <small>units</small>`,
    avgTurnaround: `${m.avgTAT.toFixed(2)} <small>units</small>`,
    avgResponse: `${m.avgRT.toFixed(2)} <small>units</small>`,
    utilization: `${m.utilization.toFixed(1)}<small>%</small>`,
    throughput: `${m.throughput.toFixed(3)} <small>p/u</small>`,
  };
  Object.entries(values).forEach(([id, value]) => { const element = $(id); if (element) element.innerHTML = value; });
  const trend = $('waitingTrend');
  if (trend) trend.textContent = m.avgWT <= 3 ? 'Efficient queue time' : 'Queue time to optimise';
}

// ============================================================
// RENDER — per-process metrics table
// ============================================================
function renderProcessMetrics(pcbs) {
  const tbody = $('processMetricsBody');
  if (!tbody || !pcbs) return;
  tbody.innerHTML = pcbs.map(p => {
    const col = p.color || getColor(p.id);
    const ct  = p.completionTime  ?? '—';
    const tat = p.turnaroundTime  ?? '—';
    const wt  = p.waitingTime     ?? '—';
    const rt  = p.responseTime    ?? '—';
    const dlOk = !p.deadline || !p.completionTime || p.completionTime <= p.deadline;
    const dlStr = p.deadline
      ? (dlOk ? p.deadline : `<span class="missed-dl">${p.deadline} ✗</span>`)
      : '—';
    return `<tr>
      <td><span class="proc-dot" style="background:${col}"></span>${p.id}</td>
      <td>${p.arrival}</td><td>${p.burst}</td><td>${p.priority}</td>
      <td class="mono-num">${ct}</td>
      <td class="mono-num">${tat}</td>
      <td class="mono-num">${wt}</td>
      <td class="mono-num">${rt}</td>
      <td>${dlStr}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// RENDER — algorithm info card
// ============================================================
function renderAlgoNote() {
  const alg  = algoSel.value;
  const meta = ALGO_META[alg] || ALGO_META.fcfs;
  const tagEl = $('algorithmTag') || document.querySelector('.info-panel .tag');

  $('algorithmTitle').textContent       = meta.name;
  if (tagEl) {
    tagEl.textContent = meta.type;
    tagEl.className = `tag ${meta.type === 'PREEMPTIVE' ? 'tag-pre' : 'tag-np'}`;
  }
  $('algorithmDescription').textContent = meta.desc;
  $('formulaText').textContent          = meta.formula;
  document.querySelector('.quantum-control')?.classList.toggle('hidden', !['rr','mlfq'].includes(alg));
  $('mlfqConfig')?.classList.toggle('hidden', alg !== 'mlfq');
  document.querySelector('.priority-control')?.classList.toggle('hidden', !alg.startsWith('priority') && alg !== 'mlfq');
  document.querySelectorAll('.deadline-col,.deadline-header').forEach(el => el.classList.toggle('hidden', alg !== 'edf'));
}

// ============================================================
// COMPARISON MODE
// ============================================================
function runComparison() {
  const opts = getOpts();
  compData = {};
  for (const alg of Object.keys(ALGO_META)) {
    try {
      const { pcbs } = simulate(processes, alg, opts);
      const m = calcMetrics(pcbs);
      if (m) compData[alg] = { ...m, algo: alg };
    } catch (e) { console.warn(alg, e); }
  }
  renderComparison();
}

function renderComparison() {
  const panel = $('comparisonPanel');
  if (!panel || !compData) return;
  const algs = Object.keys(compData);
  if (!algs.length) return;

  const bestWT   = Math.min(...algs.map(a => compData[a].avgWT));
  const bestTAT  = Math.min(...algs.map(a => compData[a].avgTAT));
  const bestRT   = Math.min(...algs.map(a => compData[a].avgRT));
  const bestUtil = Math.max(...algs.map(a => compData[a].utilization));
  const algoWidth = Math.max('Algorithm'.length, ...algs.map(a => ALGO_META[a].name.length));
  const waitingTimeText = [
    'Average Waiting Time (lower = better)',
    `${'='.repeat(algoWidth)}  ${'='.repeat(8)}`,
    `${'Algorithm'.padEnd(algoWidth)}  ${'Avg WT'.padStart(8)}`,
    ...algs.map(a => `${ALGO_META[a].name.padEnd(algoWidth)}  ${compData[a].avgWT.toFixed(2).padStart(8)}`),
  ].join('\n');

  panel.innerHTML = `
    <div class="cmp-table-wrap">
      <table class="cmp-table">
        <thead><tr><th>Algorithm</th><th>Mode</th><th>Avg WT ↓</th><th>Avg TAT ↓</th><th>Avg RT ↓</th><th>CPU Util ↑</th><th>Throughput</th></tr></thead>
        <tbody>${algs.map(a => {
          const r    = compData[a];
          const meta = ALGO_META[a];
          const cur  = a === algoSel.value;
          return `<tr class="${cur ? 'cmp-current' : ''}">
            <td><strong>${meta.name}</strong>${cur ? ' <span class="cmp-badge">current</span>' : ''}</td>
            <td><span class="cmp-type ${meta.type === 'PREEMPTIVE' ? 'pre' : 'np'}">${meta.type}</span></td>
            <td class="${r.avgWT        <= bestWT   + .01 ? 'cmp-best' : ''}">${r.avgWT.toFixed(2)}</td>
            <td class="${r.avgTAT       <= bestTAT  + .01 ? 'cmp-best' : ''}">${r.avgTAT.toFixed(2)}</td>
            <td class="${r.avgRT        <= bestRT   + .01 ? 'cmp-best' : ''}">${r.avgRT.toFixed(2)}</td>
            <td class="${r.utilization  >= bestUtil - .1  ? 'cmp-best' : ''}">${r.utilization.toFixed(1)}%</td>
            <td>${r.throughput.toFixed(3)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    <pre class="cmp-terminal-output">${escapeHTML(waitingTimeText)}</pre>`;
}

// ============================================================
// EXPORT — CSV / JSON
// ============================================================
function dlBlob(content, name, type) {
  const a   = document.createElement('a');
  a.href    = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCSV() {
  if (!lastResult) return;
  const hdr  = 'PID,Arrival,Burst,Priority,Deadline,CT,TAT,WT,RT';
  const rows = lastResult.pcbs.map(p =>
    [p.id, p.arrival, p.burst, p.priority, p.deadline || '', p.completionTime || '',
     p.turnaroundTime || '', p.waitingTime || '', p.responseTime ?? ''].join(','));
  dlBlob([hdr, ...rows].join('\n'), 'cpu-simulation.csv', 'text/csv');
  addLog('Exported CSV');
}

function exportJSON() {
  if (!lastResult) return;
  dlBlob(JSON.stringify({
    algorithm:  algoSel.value,
    algoName:   ALGO_META[algoSel.value]?.fullName,
    processes:  lastResult.pcbs,
    metrics:    lastResult.metrics,
    gantt:      lastResult.gantt,
    timestamp:  new Date().toISOString(),
  }, null, 2), 'cpu-simulation.json', 'application/json');
  addLog('Exported JSON');
}

// ============================================================
// WORKLOAD GENERATOR — pure JS stochastic distributions
// ============================================================
function generateWorkload(n, dist, lam, maxBurst) {
  let clock = 0;
  return Array.from({ length: n }, (_, i) => {
    let gap;
    if      (dist === 'poisson')     gap = poissonSample(lam);
    else if (dist === 'exponential') gap = Math.round(exponentialSample(1 / Math.max(lam, .1)));
    else                             gap = Math.floor(Math.random() * Math.max(1, Math.round(lam)));
    clock += gap;

    let burst;
    if      (dist === 'poisson')     burst = Math.max(1, Math.min(maxBurst, poissonSample(lam * 2)));
    else if (dist === 'exponential') burst = Math.max(1, Math.min(maxBurst, Math.round(exponentialSample(1 / (maxBurst / 2)))));
    else                             burst = Math.ceil(Math.random() * maxBurst);

    return {
      id:       `P${i + 1}`,
      arrival:  clock,
      burst,
      priority: Math.ceil(Math.random() * 5),
      deadline: clock + burst + Math.ceil(Math.random() * 10) + 2,
      color:    PALETTE[i % PALETTE.length],
      state:    'Ready',
    };
  });
}

function normalizeImportedProcesses(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('No processes found');
  const seen = new Set();
  return items.map((item, index) => {
    const id = String(item.id ?? item.PID ?? `P${index + 1}`).trim();
    const arrival = Number(item.arrival ?? item.AT ?? 0);
    const burst = Number(item.burst ?? item.BT ?? 0);
    const priority = Number(item.priority ?? item.Priority ?? 1);
    if (!id || seen.has(id) || !Number.isFinite(arrival) || arrival < 0 || !Number.isFinite(burst) || burst < 1) throw new Error(`Invalid process at row ${index + 1}`);
    seen.add(id);
    return { id, arrival, burst, priority: Number.isFinite(priority) ? priority : 1, deadline: Number(item.deadline ?? item.Deadline ?? 0) || arrival + burst + 10, color: PALETTE[index % PALETTE.length], state: 'Ready' };
  });
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV needs a header and at least one process');
  const headers = lines.shift().split(',').map(value => value.trim());
  return lines.map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim()]));
  });
}

async function importWorkload(file) {
  const text = await file.text();
  const data = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
  processes = normalizeImportedProcesses(Array.isArray(data) ? data : data.processes);
  addLog(`Imported ${processes.length} processes`);
  renderTable(); runSim(); updateNavCount();
}

// ============================================================
// SIMULATION RUN
// ============================================================
function getOpts() {
  const mlfqInputs = [...document.querySelectorAll('.mlfq-q-val')];
  return {
    Q:      Math.max(1, Number(quantumIn.value) || 2),
    CS:     Math.max(0, Number(csIn.value)      || 0),
    priDir: priConvIn.value || 'lower',
    mlfqQ:  mlfqInputs.length ? mlfqInputs.map(el => Math.max(1, Number(el.value) || 2)) : [2, 4, 8],
  };
}

function runSim() {
  pause();
  const previousSnapIdx = allSnaps.length ? snapIdx : 0;
  const opts = getOpts();
  try {
    const { gantt, jobGantt, snapshots, pcbs } = simulate(processes, algoSel.value, opts);
    const metrics = calcMetrics(pcbs);
    lastResult  = { gantt, jobGantt, snapshots, pcbs, metrics };
    allSnaps    = snapshots;
    snapIdx     = clamp(previousSnapIdx, 0, snapshots.length - 1);

    if (!pcbs.some(process => process.sourceFile)) {
      $('programRunTitle').textContent = 'Process completion order';
      $('programRunOutput').textContent = 'Ready.';
    }

    // Keep the editable workload in its default Ready state; playback owns live state changes.
    processes.forEach(process => { process.state = 'Ready'; });
    renderTable();
    renderGantt(gantt);
    renderMetrics(metrics);
    renderProcessMetrics(pcbs);
    if (allSnaps.length) {
      renderMonitor(allSnaps[snapIdx]);
      renderPipeline(allSnaps[snapIdx]);
    }
    updateStepProgress();
    persist();
    addLog(`${ALGO_META[algoSel.value]?.name} · ${processes.length} proc · ${metrics?.makespan ?? 0}u · AvgWT=${metrics?.avgWT?.toFixed(2) ?? '?'}`);
  } catch (err) {
    console.error(err);
    try { addLog(`Simulation error: ${err.message}`); } catch (logError) { console.error('Could not save simulator log:', logError); }
  }
}

// ============================================================
// STEP-BY-STEP PLAYBACK
// ============================================================
function stepTo(idx) {
  if (!allSnaps.length) return;
  snapIdx     = clamp(idx, 0, allSnaps.length - 1);
  const snap  = allSnaps[snapIdx];
  renderMonitor(snap);
  renderPipeline(snap);
  renderGantt(lastResult?.gantt, snap.clock);
  updateStepProgress();
  renderTable();
  renderProcessCompletionTerminal(snap);
}

function renderProcessCompletionTerminal(snap) {
  const panel = $('programRunOutputPanel');
  const title = $('programRunTitle');
  const output = $('programRunOutput');
  if (!panel || !title || !output) return;

  const completed = (lastResult?.pcbs || [])
    .filter(process => snap.processStates?.get(process.id) === 'Terminated')
    .sort((left, right) => left.completionTime - right.completionTime || left.id.localeCompare(right.id));
  panel.classList.remove('hidden');
  if (lastResult?.pcbs.some(process => process.sourceFile)) {
    const report = output.dataset.programReport || output.textContent;
    const progress = completed.length
      ? completed.map((process, index) => `${String(index + 1).padStart(2, '0')}  [t=${process.completionTime}]  ${process.id} completed`).join('\n')
      : `No process has completed yet. Running: ${snap.running || 'none'}.`;
    title.textContent = `Program output and scheduling progress at t = ${snap.clock}`;
    output.textContent = `${report}\n\nScheduling progress:\n${progress}`;
    return;
  }
  title.textContent = `Process completion order · t = ${snap.clock}`;
  output.textContent = completed.length
    ? completed.map((process, index) => `${String(index + 1).padStart(2, '0')}  [t=${process.completionTime}]  ${process.id} completed`).join('\n')
    : 'Waiting for the first process to complete...';
}

function updateStepProgress() {
  const el = $('stepProgress');
  if (el) el.textContent = allSnaps.length ? `${snapIdx + 1} / ${allSnaps.length}` : '—';
}

function play() {
  if (playTimer || !allSnaps.length) return;
  if (snapIdx >= allSnaps.length - 1) stepTo(0);
  else renderProcessCompletionTerminal(allSnaps[snapIdx]);
  $('playBtn')?.classList.add('hidden');
  $('pauseBtn')?.classList.remove('hidden');
  const spd = Number($('speedSlider')?.value) || 1;
  playTimer  = setInterval(() => {
    snapIdx++;
    if (snapIdx >= allSnaps.length) { pause(); return; }
    stepTo(snapIdx);
  }, Math.round(700 / spd));
}

function pause() {
  clearInterval(playTimer); playTimer = null;
  $('playBtn')?.classList.remove('hidden');
  $('pauseBtn')?.classList.add('hidden');
}

// ============================================================
// SYSTEM LOGS
// ============================================================
const sysLogs = [];
function addLog(msg) {
  const entry = { time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }), message: msg };
  sysLogs.unshift(entry);
  sysLogs.splice(50);
  const profileId = window.ProfileManager?.getStorageScope?.() || 'default';
  const logsKey = `cpu-simulator-logs-${profileId}`;
  let profileLogs = [];
  try { profileLogs = JSON.parse(readStoredValue(logsKey) || '[]'); } catch (_) {}
  profileLogs.unshift(entry);
  writeStoredValue(logsKey, JSON.stringify(profileLogs.slice(0, 50)));
  if (window.AppAPI) Promise.resolve(window.ProfileManager?.ready).then(() => window.AppAPI.createLog(msg,window.ProfileManager?.readProfile()?.id)).catch(error => console.warn('Could not save system log to MySQL:',error));
  const list = $('systemLogList');
  if (list) list.innerHTML = sysLogs.map(l =>
    `<li class="system-log-entry"><span class="system-log-time">${l.time}</span><span class="system-log-message">${l.message}</span></li>`).join('');
}

// ============================================================
// WORKSPACE PERSISTENCE
// ============================================================
async function ensureDatabaseWorkspace() {
  if (!window.AppAPI) return null;
  await window.ProfileManager?.ready;
  const profileId=window.ProfileManager?.getStorageScope?.()||'default';
  const activeKey='cpu-simulator-active-workspace-'+profileId;
  let id=localStorage.getItem(activeKey);
  if (/^\d+$/.test(String(id||''))) {
    try { await window.AppAPI.getWorkspace(id); return id; } catch (_) {}
  }
  const legacyScope=window.ProfileManager?.getLegacyStorageScope?.()||profileId;
  const legacyId=localStorage.getItem('cpu-simulator-active-workspace-'+legacyScope);
  let oldState=null;
  if(legacyId) oldState=localStorage.getItem('cpu-sim-ws-v3-'+legacyScope+'-'+legacyId);
  const rows=await window.AppAPI.listWorkspaces(profileId);
  const row=rows[0]||await window.AppAPI.createWorkspace(profileId,'Workspace 1');
  localStorage.setItem(activeKey,String(row.id));
  if(oldState&&!row.processes?.length&&!row.jobs?.length){
    try{await window.AppAPI.saveWorkspace(row.id,JSON.parse(oldState));localStorage.setItem('cpu-sim-ws-v3-'+profileId+'-'+row.id,oldState);}catch(error){console.warn('Could not migrate the active workspace:',error);}
  }
  return String(row.id);
}

function persist() {
  const snapshot = {
    processes, jobs, jobPolicy: $('jobPolicy')?.value || 'fcfs',
    jobAdmissionTime: $('jobAdmissionTime')?.value || 0, jobCapacity: $('jobCapacity')?.value || 5,
    algorithm: algoSel.value,
    quantum: quantumIn.value, cs: csIn.value, priConv: priConvIn.value,
  };
  writeStoredValue(workspaceStorageKey(), JSON.stringify(snapshot));
  if(window.AppAPI){
    window.__databaseWorkspaceReady=window.__databaseWorkspaceReady||ensureDatabaseWorkspace();
    window.__databaseWorkspaceReady.then(activeWorkspaceId=>{
      if(!activeWorkspaceId)return;
      clearTimeout(window.__workspaceSaveTimer);
      window.__workspaceSaveTimer=setTimeout(()=>window.AppAPI.saveWorkspace(activeWorkspaceId,{
        algorithm:snapshot.algorithm,quantum:Number(snapshot.quantum)||2,context_switch:Number(snapshot.cs)||0,
        priority_convention:snapshot.priConv,job_policy:snapshot.jobPolicy,
        job_admission_time:Number(snapshot.jobAdmissionTime)||0,job_capacity:Number(snapshot.jobCapacity)||5,
        mlfq_quanta:[2,4,8],processes:snapshot.processes,jobs:snapshot.jobs
      }).catch(error=>console.warn('Could not save workspace to MySQL:',error)),500);
    }).catch(error=>console.warn('Could not initialize MySQL workspace:',error));
  }
}
function restore() {
  try {
    const savedRaw = readStoredValue(workspaceStorageKey()) || 'null';
    const saved = JSON.parse(savedRaw);
    if (!saved?.processes?.length) return;
    processes       = saved.processes;
    jobs            = Array.isArray(saved.jobs) ? saved.jobs : [];
    algoSel.value   = saved.algorithm || 'fcfs';
    $('jobPolicy').value = saved.jobPolicy || 'fcfs';
    $('jobAdmissionTime').value = saved.jobAdmissionTime ?? 0;
    $('jobCapacity').value = saved.jobCapacity ?? 5;
    quantumIn.value = saved.quantum   || 2;
    csIn.value      = saved.cs        || 0;
    priConvIn.value = saved.priConv   || 'lower';
  } catch { /* ignore */ }
}

// ============================================================
// THEME / MOTION / CLOCK
// ============================================================
function setTheme(dark) {
  writeStoredValue(profileSettingKey('cpu-simulator-theme'), dark ? 'dark' : 'light');
  if (window.A11yManager) {
    try { window.A11yManager.applyPreferences(); } catch (error) {
      console.warn('Could not apply saved accessibility preferences:', error);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('light', !dark);
    }
  } else {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    themeBtn?.setAttribute('aria-pressed', String(dark));
    themeBtn?.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn?.querySelector('svg')?.setAttribute('data-lucide', dark ? 'sun' : 'moon');
    $('themeColor')?.setAttribute('content', dark ? '#171918' : '#f4f1ea');
    window.lucide?.createIcons?.();
  }
}
function setMotion(r) {
  document.documentElement.classList.toggle('reduce-motion', r);
  motionBtn?.setAttribute('aria-pressed', String(r));
  writeStoredValue(profileSettingKey('cpu-simulator-motion'), r ? 'reduced' : 'full');
}
function tickClock() {
  const el = $('sidebarDateTime');
  if (el) el.textContent = new Date().toLocaleString([], { dateStyle:'medium', timeStyle:'medium' });
}

// ============================================================
// EVENT HANDLERS
// ============================================================

// Process table — inline edits
$('processTable').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.index === undefined) return;
  const p  = processes[+el.dataset.index];
  if (!p) return;
  if (el.dataset.field === 'id' && p.sourceFile) {
    el.value = p.id;
    return;
  }
  if (el.dataset.field === 'color') p.color = el.value;
  else if (el.dataset.field === 'id') {
    const id = el.value.trim();
    if (!id || processes.some((process, index) => index !== +el.dataset.index && process.id.toLowerCase() === id.toLowerCase())) {
      window.alert('Process names must be non-empty and unique.');
      el.value = p.id;
      return;
    }
    p.id = id;
  } else {
    const value = Number(el.value);
    if (!Number.isFinite(value) || value < (el.dataset.field === 'arrival' ? 0 : 1)) {
      window.alert(`${el.dataset.field} must be ${el.dataset.field === 'arrival' ? 'zero or greater' : 'at least 1'}.`);
      el.value = p[el.dataset.field];
      return;
    }
    p[el.dataset.field] = value;
  }
  renderTable(); runSim();
});

// Process table — delete row
$('processTable').addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (!btn || processes.length <= 1) return;
  const rm = processes[+btn.dataset.remove];
  processes.splice(+btn.dataset.remove, 1);
  addLog(`Removed ${rm.id}`); renderTable(); updateNavCount(); runSim();
});

$('addJob').addEventListener('click', () => {
  const arrival = Number($('jobArrival').value);
  const burst = Number($('jobBurst').value);
  const priority = Number($('jobPriority').value);
  const deadline = Number($('jobDeadline').value);
  if (![arrival, burst, priority, deadline].every(Number.isFinite) || arrival < 0 || burst < 1 || priority < 1 || deadline < 1) {
    window.alert('Enter a valid arrival, burst, priority, and deadline for this job.');
    return;
  }
  let number = 1;
  while (jobs.some(job => job.id === `J${number}`) || processes.some(process => process.id === `J${number}`)) number++;
  jobs.push({ id: `J${number}`, arrival, burst, priority, deadline });
  addLog(`Queued job J${number}`);
  renderJobQueue();
  admitJobsToCpu();
  persist();
});
$('generateJobs')?.addEventListener('click', () => {
  const count = clamp(Math.floor(Number($('jobGenerateCount').value) || 5), 1, 20);
  const generated = generateWorkload(count, 'uniform', 2, 8);
  const usedIds = new Set([
    ...jobs.map(job => job.id.toLowerCase()),
    ...processes.map(process => process.id.toLowerCase()),
  ]);

  generated.forEach((workload, index) => {
    let number = jobs.length + index + 1;
    while (usedIds.has(`j${number}`)) number++;
    const id = `J${number}`;
    usedIds.add(id.toLowerCase());
    jobs.push({
      id,
      arrival: workload.arrival,
      burst: workload.burst,
      priority: workload.priority,
      deadline: workload.deadline,
    });
  });

  $('jobSchedulerStatus').textContent = `Generated ${count} jobs (uniform arrivals, bursts 1-8).`;
  addLog(`Generated ${count} jobs (uniform workload)`);
  renderJobQueue();
  admitJobsToCpu();
  persist();
});

$('resetSchedulers')?.addEventListener('click', () => {
  pause();
  processes = [];
  jobs = [];
  $('jobSchedulerStatus').textContent = '';
  renderJobQueue();
  renderTable();
  updateNavCount();
  runSim();
  $('runningProcess').innerHTML = '<span class="queue-empty">— idle —</span>';
  $('readyQueueMonitor').innerHTML = '<span class="queue-empty">Queue empty</span>';
  $('pipelineWindow').innerHTML = '<span class="queue-empty">Run a simulation to populate the pipeline.</span>';
  $('processMetricsBody').innerHTML = '';
  ['avgWaiting', 'avgTurnaround', 'avgResponse', 'utilization', 'throughput'].forEach(id => {
    const element = $(id);
    if (element) element.textContent = '—';
  });
  renderGantt([]);
  addLog('Reset short-term and long-term schedulers');
  persist();
});
$('jobTable').addEventListener('click', event => {
  const removeButton = event.target.closest('[data-job-remove]');
  if (!removeButton) return;
  jobs = jobs.filter(job => job.id !== removeButton.dataset.jobRemove);
  renderJobQueue();
  persist();
});
$('jobPolicy').addEventListener('change', () => {
  renderJobQueue();
  admitJobsToCpu();
  persist();
});
$('jobAdmissionTime').addEventListener('change', () => { admitJobsToCpu(); persist(); });
$('jobCapacity').addEventListener('change', () => { admitJobsToCpu(); persist(); });

// Run / Reset
const ganttCanvas = $('ganttCanvas');
const ganttTooltip = $('ganttTooltip');
if (ganttTooltip && ganttTooltip.parentElement !== document.body) document.body.appendChild(ganttTooltip);
function positionGanttTooltip(event) {
  if (!ganttTooltip || ganttTooltip.classList.contains('hidden')) return;
  const margin = 12;
  const rect = ganttTooltip.getBoundingClientRect();
  let left = event.clientX + 14;
  let top = event.clientY + 14;
  if (left + rect.width > window.innerWidth - margin) left = event.clientX - rect.width - 14;
  if (top + rect.height > window.innerHeight - margin) top = event.clientY - rect.height - 14;
  ganttTooltip.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin))}px`;
  ganttTooltip.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin))}px`;
}
function showPcbTooltip(block, event) {
  const processId = block.dataset.pid || block.dataset.blockId;
  const type = block.dataset.type;
  const pcb = lastResult?.pcbs.find(process => process.id === processId);
  if (!pcb || (type && type !== 'cpu' && !block.classList.contains('swimlane-seg'))) {
    ganttTooltip?.classList.add('hidden');
    return;
  }
  const blockStart = Number(block.dataset.start);
  const queueState = allSnaps[snapIdx]?.processStates?.get(processId);
  const historicalState = queueState || block.dataset.state || pcb.history?.[blockStart];
  const stateLabels = {
    running: 'Running', ready: 'Ready', waiting: 'Waiting', new: 'New',
    unsubmitted: 'New', job_pool: 'Waiting', cs: 'Waiting', terminated: 'Terminated',
  };
  const displayState = stateLabels[String(historicalState || '').toLowerCase()] || historicalState || pcb.state;
  const snapshotPc = allSnaps[snapIdx]?.programCounters?.get(processId);
  const programCounter = Number.isFinite(snapshotPc) ? snapshotPc : (pcb.programCounter || 0);
  const rows = [
    ['State', displayState], ['Program Counter', `${programCounter} instruction units`],
    ['Arrival', `${pcb.arrival} units`], ['Burst', `${pcb.burst} units`],
    ['Remaining', `${pcb.remaining} units`], ['Priority', pcb.priority],
    ['Deadline', Number.isFinite(pcb.deadline) ? `t = ${pcb.deadline}` : '—'],
    ['Response', pcb.responseTime == null ? '—' : `${pcb.responseTime} units`],
    ['Completion', pcb.completionTime == null ? '—' : `t = ${pcb.completionTime}`],
    ['Turnaround', pcb.turnaroundTime == null ? '—' : `${pcb.turnaroundTime} units`],
    ['Waiting', pcb.waitingTime == null ? '—' : `${pcb.waitingTime} units`],
  ];
  if (!ganttTooltip) return;
  ganttTooltip.innerHTML = `<div class="tooltip-title">${escapeHTML(pcb.id)} <span class="tooltip-badge">PCB</span></div>${rows.map(([label, value]) => `<div class="tooltip-row"><span class="tooltip-label">${escapeHTML(label)}</span><span class="tooltip-val">${escapeHTML(value)}</span></div>`).join('')}`;
  ganttTooltip.classList.remove('hidden');
  positionGanttTooltip(event);
}
ganttCanvas?.addEventListener('pointerover', event => {
  const block = event.target.closest('.timeline-block, .swimlane-seg');
  if (block && ganttCanvas.contains(block)) showPcbTooltip(block, event);
});
ganttCanvas?.addEventListener('pointermove', positionGanttTooltip);
ganttCanvas?.addEventListener('pointerout', event => {
  const block = event.target.closest('.timeline-block, .swimlane-seg');
  if (block && !block.contains(event.relatedTarget)) ganttTooltip?.classList.add('hidden');
});
document.querySelector('.gantt-view-switch')?.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  ganttViewMode = button.dataset.view;
  document.querySelectorAll('.gantt-view-switch [data-view]').forEach(tab => {
    const selected = tab === button;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  renderGantt(lastResult?.gantt, allSnaps[snapIdx]?.clock ?? null);
});
$('ganttScale')?.addEventListener('change', event => {
  ganttScaleMode = event.target.value;
  renderGantt(lastResult?.gantt, allSnaps[snapIdx]?.clock ?? null);
});
// Algorithm / config changes
algoSel.addEventListener('change',   () => { renderAlgoNote(); addLog(`Algorithm → ${ALGO_META[algoSel.value]?.name}`); runSim(); });
csIn.addEventListener('change',       runSim);
quantumIn.addEventListener('change',  runSim);
priConvIn.addEventListener('change',  runSim);

// Motion
motionBtn?.addEventListener('click', () => setMotion(!document.documentElement.classList.contains('reduce-motion')));

// Playback
$('playBtn')?.addEventListener('click',     playOrRunPrograms);
$('pauseBtn')?.addEventListener('click',    pause);
$('stepFwdBtn')?.addEventListener('click',  () => { pause(); stepTo(snapIdx + 1); });
$('stepBwdBtn')?.addEventListener('click',  () => { pause(); stepTo(snapIdx - 1); });
$('stepResetBtn')?.addEventListener('click',() => { pause(); stepTo(0); });
function seekToTime() {
  if (!allSnaps.length) return;
  const requestedTime = Number($('ganttSeekInput')?.value);
  if (!Number.isFinite(requestedTime)) return;
  const targetTime = Math.max(0, requestedTime);
  let targetIndex = 0;
  let closestDistance = Infinity;
  allSnaps.forEach((snap, index) => {
    const distance = Math.abs(snap.clock - targetTime);
    if (distance < closestDistance) {
      closestDistance = distance;
      targetIndex = index;
    }
  });
  pause();
  stepTo(targetIndex);
}
$('ganttSeekBtn')?.addEventListener('click', seekToTime);
$('ganttSeekInput')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') seekToTime();
});
$('speedSlider')?.addEventListener('input', e => {
  if ($('speedLabel')) $('speedLabel').textContent = `${e.target.value}×`;
  if (playTimer) { pause(); play(); }
});

// Comparison
$('compareBtn')?.addEventListener('click', () => {
  runComparison();
  const sec = $('comparisonSection');
  sec?.classList.remove('hidden');
  sec?.scrollIntoView({ behavior:'smooth' });
});
$('closeCompare')?.addEventListener('click', () => $('comparisonSection')?.classList.add('hidden'));

// Export
$('exportCSV')?.addEventListener('click',  exportCSV);
$('exportJSON')?.addEventListener('click', exportJSON);

const workloadFile = $('workloadFile');
$('importButton')?.addEventListener('click', () => workloadFile?.click());
workloadFile?.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importWorkload(file); } catch (error) { window.alert(`Import failed: ${error.message}`); }
  event.target.value = '';
});

const programDropzone = $('programDropzone');
const programFileList = $('programFileList');
const programFilesInput = $('programFilesInput');
const supportedProgramExtensions = new Set(['.py', '.c', '.cc', '.cpp', '.cxx']);
let selectedProgramFiles = [];
let programFilesPrepared = false;
let programRunInProgress = false;
let processQueueBeforeProgramSelection = null;

function restoreProcessQueueAfterProgramFailure() {
  if (!processQueueBeforeProgramSelection) return;
  processes = processQueueBeforeProgramSelection;
  processQueueBeforeProgramSelection = null;
  renderTable();
  updateNavCount();
  runSim();
}

function selectProgramFiles(fileList) {
  const files = Array.from(fileList || []);
  const supported = files.filter(file => supportedProgramExtensions.has(file.name.slice(file.name.lastIndexOf('.')).toLowerCase()));
  const oversized = supported.filter(file => file.size > 256 * 1024);
  if ((!selectedProgramFiles.length || programFilesPrepared) && processQueueBeforeProgramSelection === null) {
    processQueueBeforeProgramSelection = processes.map(process => ({ ...process }));
  }
  const candidates = [...(programFilesPrepared ? [] : selectedProgramFiles), ...supported]
    .filter((file, index, all) => all.findIndex(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index);
  const eligible = candidates.filter(file => file.size <= 256 * 1024);
  selectedProgramFiles = eligible.slice(0, 10);
  programFilesPrepared = false;
  programFileList.replaceChildren(...selectedProgramFiles.map(file => {
    const item = document.createElement('li');
    item.textContent = file.name;
    return item;
  }));
  const status = $('programFilesStatus');
  const skipped = files.length - supported.length + oversized.length + Math.max(0, eligible.length - 10);
  status.classList.toggle('error', !selectedProgramFiles.length || skipped > 0);
  status.textContent = selectedProgramFiles.length
    ? `${selectedProgramFiles.length} file${selectedProgramFiles.length === 1 ? '' : 's'} ready${skipped ? `; skipped ${skipped} unsupported, oversized, or excess file${skipped === 1 ? '' : 's'}` : ''}.`
    : 'Drop or choose .py, .c, .cc, .cpp, or .cxx files up to 256 KB each.';
  if (selectedProgramFiles.length) {
    status.textContent = `${selectedProgramFiles.length} source file${selectedProgramFiles.length === 1 ? '' : 's'} ready. Press Gantt Play to run and measure ${selectedProgramFiles.length === 1 ? 'it' : 'them'}.${skipped ? ` Skipped ${skipped} unsupported, oversized, or excess file${skipped === 1 ? '' : 's'}.` : ''}`;
  } else {
    restoreProcessQueueAfterProgramFailure();
    status.classList.toggle('error', !selectedProgramFiles.length || skipped > 0);
  }
  renderJobQueue();
  $('programRunOutputPanel')?.classList.remove('hidden');
}

programDropzone?.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    programFilesInput?.click();
  }
});
programFilesInput?.addEventListener('change', event => {
  selectProgramFiles(event.currentTarget.files);
  event.currentTarget.value = '';
});

programDropzone?.addEventListener('dragenter', event => {
  event.preventDefault();
  programDropzone.classList.add('drag-over');
});
programDropzone?.addEventListener('dragover', event => {
  event.preventDefault();
  programDropzone.classList.add('drag-over');
});
programDropzone?.addEventListener('dragleave', event => {
  if (!programDropzone.contains(event.relatedTarget)) programDropzone.classList.remove('drag-over');
});
programDropzone?.addEventListener('drop', event => {
  event.preventDefault();
  programDropzone.classList.remove('drag-over');
  selectProgramFiles(event.dataTransfer?.files);
});

async function runSelectedPrograms() {
  if (!selectedProgramFiles.length) {
    const status = $('programFilesStatus');
    status.classList.add('error');
    status.textContent = 'Drop or browse for source files first.';
    return false;
  }
  const status = $('programFilesStatus');
  const outputPanel = $('programRunOutputPanel');
  const output = $('programRunOutput');
  const title = $('programRunTitle');
  status.classList.remove('error');
  if (programRunInProgress) return false;
  programRunInProgress = true;
  const completed = [];
  const report = [];
  outputPanel.classList.remove('hidden');
  title.textContent = 'Running source files';
  output.textContent = '';
  output.dataset.programReport = '';
  try {
    for (let index = 0; index < selectedProgramFiles.length; index++) {
      const file = selectedProgramFiles[index];
      status.textContent = `Running ${index + 1} of ${selectedProgramFiles.length}: ${file.name}…`;
      output.textContent = status.textContent;
      let result;
      try {
        const response = await fetch(`/api/v1/programs/run?filename=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        });
        result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Could not run this source file.');
      } catch (error) {
        result = { ok: false, phase: 'run', error: error.message, stdout: '', stderr: '' };
      }

      report.push(`=== ${file.name} ===`);
      if (result.ok) {
        const stem = file.name.slice(0, file.name.lastIndexOf('.'));
        const baseId = stem.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'Program';
        const baseQueue = processQueueBeforeProgramSelection || processes;
        const usedIds = new Set([...baseQueue, ...completed].map(process => process.id.toLowerCase()));
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id.toLowerCase())) {
          const suffixText = `-${suffix++}`;
          id = `${baseId.slice(0, 40 - suffixText.length)}${suffixText}`;
        }
        const burst = clamp(Math.ceil(Math.max(1, result.runtime_ms) / 10), 1, 500);
        completed.push({
          id,
          sourceFile: file.name,
          arrival: 0,
          burst,
          measuredRuntimeMs: result.runtime_ms,
          priority: 1,
          deadline: burst + 10,
          color: PALETTE[completed.length % PALETTE.length],
          state: 'Ready',
        });
        report.push(`Ran in ${result.runtime_ms} ms; simulated burst ${burst} units.`);
      } else {
        report.push(result.error || (result.timed_out ? 'Stopped after the 5 second limit.' : `${result.phase === 'compile' ? 'Compilation failed' : `Exited with code ${result.exit_code}`}.`));
      }
      if (result.stdout) report.push(`stdout:\n${result.stdout}`);
      if (result.stderr) report.push(`stderr:\n${result.stderr}`);
    }

    if (completed.length) {
      const baseQueue = processQueueBeforeProgramSelection || processes;
      processes = [...baseQueue.map(process => ({ ...process })), ...completed];
      processQueueBeforeProgramSelection = null;
      addLog(`Ran ${completed.length} source program${completed.length === 1 ? '' : 's'} and simulated measured bursts`);
      renderTable();
      updateNavCount();
      runSim();
    }
    const failed = selectedProgramFiles.length - completed.length;
    programFilesPrepared = completed.length > 0;
    if (!completed.length) restoreProcessQueueAfterProgramFailure();
    renderJobQueue();
    status.classList.toggle('error', failed > 0 || !completed.length);
    status.textContent = completed.length
      ? `Simulating ${completed.length} program${completed.length === 1 ? '' : 's'}; ${failed} failed. Gantt, WT, and TAT use the measured bursts.`
      : 'No programs ran successfully; the existing process queue was kept.';
    title.textContent = completed.length ? 'Program output and measured runtimes' : 'Program run results';
    output.dataset.programReport = report.join('\n\n').slice(0, 100_000) || '(no output)';
    output.textContent = output.dataset.programReport;
    return completed.length > 0;
  } catch (error) {
    restoreProcessQueueAfterProgramFailure();
    status.classList.add('error');
    status.textContent = error.message;
    title.textContent = 'Could not run source files';
    output.textContent = error.message;
    return false;
  } finally {
    programRunInProgress = false;
  }
}

async function playOrRunPrograms() {
  if (programRunInProgress) return;
  if (selectedProgramFiles.length && !programFilesPrepared) {
    pause();
    const ranPrograms = await runSelectedPrograms();
    if (!ranPrograms) return;
  }
  play();
}

async function startSchedulingFromTerminal() {
  if (!allSnaps.length && !selectedProgramFiles.length) {
    $('programRunOutput').textContent = 'No scheduling run is ready. Update the workload or settings, then try again.';
    return;
  }
  $('programRunOutput').textContent = 'Starting scheduling...';
  await playOrRunPrograms();
}

$('terminalCommand')?.addEventListener('keydown', event => {
  const input = event.currentTarget;
  event.preventDefault();
  input.value = '';
  if (event.key === 'Enter') {
    startSchedulingFromTerminal();
    return;
  }
  pause();
  $('programRunOutput').textContent = 'Scheduling stopped.';
});

// Workload generator
$('generateBtn')?.addEventListener('click', () => {
  const n      = Math.max(1, Math.min(20, +($('genCount')?.value    || 5)));
  const dist   = $('genDist')?.value     || 'uniform';
  const lam    = Math.max(.1, +($('genLambda')?.value   || 2));
  const maxB   = Math.max(1,  +($('genMaxBurst')?.value || 8));
  fetch(`/api/workload?count=${n}&distribution=${dist}&lambda=${lam}&maxBurst=${maxB}`)
    .then(response => response.ok ? response.json() : Promise.reject(new Error('Python workload service unavailable')))
    .then(data => { processes = normalizeImportedProcesses(data); addLog(`Generated ${n} processes with Python (${dist})`); renderTable(); runSim(); updateNavCount(); })
    .catch(() => { processes = generateWorkload(n, dist, lam, maxB); addLog(`Generated ${n} processes (${dist} dist)`); renderTable(); runSim(); updateNavCount(); });
});

// Preset
presetSel?.addEventListener('change', () => {
  const PRESETS = {
    balanced:     [{ id:'P1',arrival:0,burst:5,priority:2,deadline:10 },{ id:'P2',arrival:1,burst:3,priority:1,deadline:7  },{ id:'P3',arrival:2,burst:8,priority:3,deadline:20 },{ id:'P4',arrival:3,burst:2,priority:2,deadline:8  },{ id:'P5',arrival:4,burst:4,priority:1,deadline:15 }],
    'burst-heavy':[{ id:'P1',arrival:0,burst:24,priority:1,deadline:30},{ id:'P2',arrival:0,burst:3,priority:2,deadline:5  },{ id:'P3',arrival:0,burst:3,priority:3,deadline:5  }],
    interactive:  [{ id:'P1',arrival:0,burst:3,priority:1,deadline:6  },{ id:'P2',arrival:1,burst:2,priority:2,deadline:5  },{ id:'P3',arrival:2,burst:4,priority:1,deadline:9  },{ id:'P4',arrival:4,burst:2,priority:3,deadline:8  },{ id:'P5',arrival:5,burst:3,priority:2,deadline:10 }],
    realtime:     [{ id:'P1',arrival:0,burst:2,priority:1,deadline:4  },{ id:'P2',arrival:1,burst:4,priority:2,deadline:8  },{ id:'P3',arrival:0,burst:1,priority:1,deadline:2  },{ id:'P4',arrival:2,burst:3,priority:3,deadline:10 }],
  };
  const ps = PRESETS[presetSel.value];
  const status = $('presetStatus');
  if (!ps) {
    if (status) status.textContent = 'Choose a workload preset to load processes and update the simulation.';
    return;
  }
  processes = ps.map((p, i) => ({ ...p, color:PALETTE[i%PALETTE.length], state:'Ready' }));
  addLog(`Preset: ${presetSel.value}`); renderTable(); runSim();
  if (status) {
    const name = presetSel.options[presetSel.selectedIndex]?.textContent || presetSel.value;
    status.textContent = presetSel.value === 'balanced'
      ? `${name} loaded (${processes.length} processes). This is the same workload as the starter example; simulation recalculated.`
      : `${name} loaded (${processes.length} processes); simulation recalculated.`;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === ' ')         { e.preventDefault(); playTimer ? pause() : play(); }
  if (e.key === 'ArrowRight'){ pause(); stepTo(snapIdx + 1); }
  if (e.key === 'ArrowLeft') { pause(); stepTo(snapIdx - 1); }
});

// Nav count update
function updateNavCount() {
  const el = document.querySelector('.nav-count');
  if (el) el.textContent = processes.length;
}

// ============================================================
// INIT
// ============================================================
if (window.A11yManager) {
  try { window.A11yManager.applyPreferences(); } catch (error) {
    console.warn('Could not load saved accessibility preferences:', error);
    document.documentElement.classList.add('light');
  }
} else {
  setTheme(readStoredValue(profileSettingKey('cpu-simulator-theme')) === 'dark');
}
setMotion(readStoredValue(profileSettingKey('cpu-simulator-motion')) === 'reduced');
restore();
renderAlgoNote();
renderJobQueue();
renderTable();
runSim();
tickClock();
setInterval(tickClock, 1000);
