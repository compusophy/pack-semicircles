import { getMinEnclosingCircle } from './welzl';
import { semicirclesOverlap } from './geometry';

interface Semicircle {
    x: number;
    y: number;
    theta: number;
}

const N_SEMICIRCLES = 15;

let globalBestScs: Semicircle[] = [];
let globalBestScore = Infinity;

let personalBestScs: Semicircle[] = [];
let personalBestScore = Infinity;

let currentScs: Semicircle[] = [];
let currentScore = Infinity;

let running = false;
let workerId = 0;
let workerType = 'explorer';

let temp = 0.01;
let stepSize = 0.05;
let restarts = 0;
let phase: 'ANNEAL' | 'POLISH' = 'ANNEAL';
let polishStagnationCount = 0;

function getScore(scs: Semicircle[]) {
    const points = [];
    for (const sc of scs) {
        points.push({ x: sc.x, y: sc.y });
        for (let i = 0; i <= 30; i++) {
            const angle = sc.theta - Math.PI / 2 + (Math.PI * i) / 30;
            points.push({ x: sc.x + Math.cos(angle), y: sc.y + Math.sin(angle) });
        }
    }
    return getMinEnclosingCircle(points).r;
}

function countOverlaps(scs: Semicircle[]): number {
    let count = 0;
    for (let i = 0; i < N_SEMICIRCLES; i++) {
        for (let j = i + 1; j < N_SEMICIRCLES; j++) {
            if (semicirclesOverlap(scs[i], scs[j])) count++;
        }
    }
    return count;
}

function gaussianRandom() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const runBatch = () => {
    if (!running) return;

    let improvedPersonal = false;
    let acceptedMoves = 0;
    const BATCH_SIZE = 2000;

    let currentOverlaps = countOverlaps(currentScs);

    for (let iter = 0; iter < BATCH_SIZE; iter++) {
        const idx = Math.floor(Math.random() * N_SEMICIRCLES);
        const sc = currentScs[idx];

        const dx = gaussianRandom() * stepSize;
        const dy = gaussianRandom() * stepSize;
        const dtheta = gaussianRandom() * stepSize * Math.PI;

        const newSc = {
            x: sc.x + dx,
            y: sc.y + dy,
            theta: sc.theta + dtheta
        };

        const nextScs = [...currentScs];
        nextScs[idx] = newSc;

        if (currentOverlaps > 0) {
            const nextOverlaps = countOverlaps(nextScs);
            if (nextOverlaps < currentOverlaps || (nextOverlaps === currentOverlaps && Math.random() < 0.5)) {
                currentScs = nextScs;
                currentOverlaps = nextOverlaps;
                if (currentOverlaps === 0) {
                    currentScore = getScore(currentScs);
                }
            }
        } else {
            let valid = true;
            for (let i = 0; i < N_SEMICIRCLES; i++) {
                if (i !== idx && semicirclesOverlap(newSc, currentScs[i])) {
                    valid = false;
                    break;
                }
            }

            if (valid) {
                const nextScore = getScore(nextScs);
                const deltaE = nextScore - currentScore;
                
                // Pure Greedy if POLISH, otherwise SA
                const isAcceptable = phase === 'POLISH' ? (deltaE < 0) : (deltaE < 0 || Math.random() < Math.exp(-deltaE / temp));

                if (isAcceptable) {
                    currentScs = nextScs;
                    currentScore = nextScore;
                    acceptedMoves++;

                    if (currentScore < personalBestScore) {
                        personalBestScore = currentScore;
                        personalBestScs = currentScs.map(s => ({...s}));
                        improvedPersonal = true;
                        if (phase === 'POLISH') polishStagnationCount = 0;
                    }
                }
            }
        }
    }

    if (currentOverlaps === 0) {
        if (workerType === 'greedy') {
            stepSize = Math.max(0.000001, Math.min(stepSize * (acceptedMoves > 0 ? 1.05 : 0.95), 0.01));
            temp = 0;
            phase = 'POLISH';
        } else {
            // Adaptive MCMC step size during ANNEAL
            if (phase === 'ANNEAL') {
                const acceptanceRate = acceptedMoves / BATCH_SIZE;
                if (acceptanceRate > 0.234) stepSize *= 1.02;
                else stepSize *= 0.98;
                stepSize = Math.max(0.0001, Math.min(stepSize, 0.5));
                
                temp *= 0.95;
                
                // Cool down -> Switch to Polish
                if (temp < 0.00001) {
                    phase = 'POLISH';
                    stepSize = 0.005; // Start with small steps for polishing
                    polishStagnationCount = 0;
                    // Jump to best found so far in this run
                    currentScs = personalBestScs.map(s => ({...s}));
                    currentScore = personalBestScore;
                }
            } else if (phase === 'POLISH') {
                if (acceptedMoves === 0) {
                    polishStagnationCount++;
                    stepSize *= 0.5; // shrink step size aggressively if stuck
                } else {
                    stepSize *= 1.05; // allow it to grow if finding improvements
                }
                stepSize = Math.max(0.0000001, Math.min(stepSize, 0.01));

                // If perfectly polished and entirely stuck -> Report Stagnation
                if (polishStagnationCount > 10) {
                    self.postMessage({ 
                        type: 'STAGNATED', 
                        payload: { id: workerId, semicircles: personalBestScs, score: personalBestScore } 
                    });
                    
                    // We will keep kicking locally until the RESTART_SEED message overrides us
                    restarts++;
                    const kickStrength = 0.01 + (workerId / 16.0) * 0.15;
                    for (let i = 0; i < N_SEMICIRCLES; i++) {
                        currentScs[i].x += gaussianRandom() * kickStrength;
                        currentScs[i].y += gaussianRandom() * kickStrength;
                        currentScs[i].theta += gaussianRandom() * kickStrength * Math.PI;
                    }
                    currentOverlaps = countOverlaps(currentScs);
                    if (currentOverlaps === 0) currentScore = getScore(currentScs);
                    else currentScore = Infinity;
                    
                    temp = 0.005 + (workerId / 16.0) * 0.02;
                    stepSize = 0.1;
                    phase = 'ANNEAL';
                }
            }
        }
    } else {
        stepSize = 0.1;
    }

    if (improvedPersonal && personalBestScore < globalBestScore) {
        globalBestScore = personalBestScore;
        globalBestScs = personalBestScs.map(s => ({...s}));
        self.postMessage({ type: 'IMPROVED', payload: { semicircles: personalBestScs, score: personalBestScore } });
    }

    self.postMessage({ 
        type: 'STATUS', 
        payload: { 
            id: workerId, 
            currentScore: currentOverlaps > 0 ? Infinity : currentScore, 
            bestScore: personalBestScore < globalBestScore ? personalBestScore : globalBestScore, 
            restarts: restarts,
            semicircles: currentScs.map(s => ({...s})),
            type: workerType === 'greedy' ? 'greedy' : `explorer (${phase})`
        } 
    });

    setTimeout(runBatch, 0);
};

self.onmessage = (e) => {
    if (e.data.type === 'START') {
        workerId = e.data.payload.id;
        workerType = e.data.payload.workerType;
        
        globalBestScs = e.data.payload.semicircles.map((s: any) => ({...s}));
        
        const overlaps = countOverlaps(globalBestScs);
        if (overlaps === 0) globalBestScore = getScore(globalBestScs);
        else globalBestScore = Infinity;
        
        personalBestScs = globalBestScs.map(s => ({...s}));
        personalBestScore = globalBestScore;
        
        currentScs = globalBestScs.map(s => ({...s}));
        currentScore = globalBestScore;
        
        temp = 0.005 + (workerId / 16.0) * 0.02;
        stepSize = 0.1;
        restarts = 0;
        phase = workerType === 'greedy' ? 'POLISH' : 'ANNEAL';
        
        running = true;
        runBatch();
    } else if (e.data.type === 'STOP') {
        running = false;
    } else if (e.data.type === 'SYNC') {
        const newScore = e.data.payload.score;
        if (newScore < globalBestScore) {
            globalBestScore = newScore;
            globalBestScs = e.data.payload.semicircles.map((s: any) => ({...s}));
            
            // Only greedy workers immediately adopt the new global best.
            // Explorers stick to their own branch until they fully stagnate!
            if (workerType === 'greedy' || countOverlaps(currentScs) > 0) {
                currentScs = globalBestScs.map(s => ({...s}));
                currentScore = globalBestScore;
                if (workerType !== 'greedy') {
                    temp = 0.005 + (workerId / 16.0) * 0.02;
                    stepSize = 0.1;
                    phase = 'ANNEAL';
                }
            }
        }
    } else if (e.data.type === 'RESTART_SEED') {
        // App.tsx gives us a good seed from the archive to explore next!
        const seedScs = e.data.payload.semicircles.map((s: any) => ({...s}));
        let seedScore = Infinity;
        if (countOverlaps(seedScs) === 0) seedScore = getScore(seedScs);

        currentScs = seedScs.map(s => ({...s}));
        currentScore = seedScore;
        personalBestScs = seedScs.map(s => ({...s}));
        personalBestScore = seedScore;

        // Start annealing from this new basin
        temp = 0.005 + (workerId / 16.0) * 0.02;
        stepSize = 0.1;
        phase = 'ANNEAL';
    }
};
