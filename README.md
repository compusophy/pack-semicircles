# Pack Semicircles Optimizer

A high-performance, mathematically rigorous optimization engine designed to solve the complex geometric challenge of packing 15 unit semicircles into the smallest possible enclosing circle.

## Overview

Finding the optimal packing of irregular shapes is a notoriously difficult problem in computational geometry. This application tackles the 15-semicircle packing problem using a sophisticated **Parallel Tempering Markov Chain Monte Carlo (MCMC)** algorithm, distributed across a swarm of Web Workers.

## Features

* **Interactive Canvas:** Manually drag and rotate semicircles to explore configurations or provide starting seeds for the optimizer.
* **Worker Swarm Architecture:** Utilizes 16 parallel Web Workers to explore the configuration space simultaneously without blocking the main UI thread.
  * **12 Explorers:** Use Simulated Annealing and Basin Hopping (Iterated Local Search) to escape local minima and find novel dense structures.
  * **4 Greedy Polishers:** Perform microscopic steps on the global best configuration to squeeze out the final fractions of the enclosing radius.
* **Live Visualization:** Watch the global best solution evolve in real-time alongside a 4x4 grid showing the live state of all 16 workers.
* **Export & Import:** Save your best configurations to JSON and load them later to resume optimization.

## The Mathematics

The optimization engine abandons simple heuristics in favor of a rigorous thermodynamic approach:
* **State Space:** A 45-dimensional continuous configuration space (x, y, theta for 15 semicircles).
* **Proposal Distribution:** Pure Gaussian Random Walk (Brownian motion) using the Box-Muller transform.
* **Adaptive Step Size:** Dynamically targets an acceptance rate of exactly 0.234, the proven optimal rate for random walk Metropolis algorithms in high-dimensional spaces.
* **Strict Constraints:** Overlapping states are strictly rejected during the annealing phase. If forced into an overlap (e.g., via manual drag), the engine switches to a discrete overlap-resolution phase.

## Development

This project is built with React, TypeScript, Vite, and Tailwind CSS.

### Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Build for production
npm run build
```
