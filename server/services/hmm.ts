/**
 * Gaussian Mixture Hidden Markov Model
 * Implements Baum-Welch EM for parameter estimation, Viterbi for hard decoding,
 * and Forward-Backward for soft (posterior) state probabilities.
 *
 * All operations are performed in log-space for numerical stability.
 * Emission model: diagonal-covariance multivariate Gaussian.
 */

export interface HMMParams {
  pi: number[];      // [K] initial state distribution
  A: number[][];     // [K×K] row-stochastic transition matrix
  mu: number[][];    // [K×D] emission means per state
  sigma: number[][]; // [K×D] emission variances per state (diagonal)
}

export interface HMMFitResult {
  params: HMMParams;
  logLikelihood: number;
  iterations: number;
}

// ── Numerics ──────────────────────────────────────────────────────────────────

/** Numerically stable log-sum-exp */
function lse(arr: number[]): number {
  let max = -Infinity;
  for (const v of arr) if (v > max) max = v;
  if (!isFinite(max)) return -Infinity;
  let sum = 0;
  for (const v of arr) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

/** Diagonal-covariance Gaussian log-pdf */
function gaussLogPdf(x: number[], mu: number[], sigma: number[]): number {
  let lp = 0;
  for (let d = 0; d < x.length; d++) {
    const v = Math.max(sigma[d], 1e-6);
    lp += -0.5 * (Math.log(2 * Math.PI * v) + (x[d] - mu[d]) ** 2 / v);
  }
  return lp;
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialise HMM parameters via deterministic K-means-like partition.
 * Sorts observations on dimension 0 and assigns each third to a state.
 * States are ordered LOW→HIGH on dim-0 (caller must orient features so
 * expansion = low dim-0, stress = high dim-0 ... or just reorder after fit).
 */
function initParams(obs: number[][], K: number): HMMParams {
  const T = obs.length;
  const D = obs[0].length;

  const sorted = Array.from({ length: T }, (_, i) => i).sort(
    (a, b) => obs[a][0] - obs[b][0]
  );
  const bucketSize = Math.ceil(T / K);

  const mu: number[][] = [];
  const sigma: number[][] = [];

  for (let k = 0; k < K; k++) {
    const bucket = sorted.slice(k * bucketSize, (k + 1) * bucketSize);
    const m = new Array(D).fill(0);
    for (const i of bucket) for (let d = 0; d < D; d++) m[d] += obs[i][d];
    for (let d = 0; d < D; d++) m[d] /= bucket.length;
    mu.push(m);

    const sv = new Array(D).fill(1.0); // start with unit variance
    sigma.push(sv);
  }

  const pi = new Array(K).fill(1 / K);
  const A: number[][] = Array.from({ length: K }, (_, k) =>
    Array.from({ length: K }, (_, j) => (k === j ? 0.8 : 0.2 / (K - 1)))
  );

  return { pi, A, mu, sigma };
}

// ── Core algorithms ───────────────────────────────────────────────────────────

/**
 * Baum-Welch EM algorithm.
 * Converges when |ΔlogL| < tol or maxIter is reached.
 */
export function trainHMM(
  obs: number[][],
  K: number,
  maxIter = 100,
  tol = 1e-5
): HMMFitResult {
  const T = obs.length;
  const D = obs[0].length;
  const params = initParams(obs, K);
  const { pi, A, mu, sigma } = params;

  let prevLogLik = -Infinity;
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;

    // --- E-step ---

    // Log-emission matrix [T × K]
    const logB: number[][] = obs.map(ot =>
      Array.from({ length: K }, (_, k) => gaussLogPdf(ot, mu[k], sigma[k]))
    );

    // Forward log-probabilities [T × K]
    const logAlpha: number[][] = Array.from({ length: T }, () =>
      new Array(K).fill(-Infinity)
    );
    for (let k = 0; k < K; k++)
      logAlpha[0][k] = Math.log(pi[k] + 1e-300) + logB[0][k];
    for (let t = 1; t < T; t++) {
      for (let k = 0; k < K; k++) {
        const incoming = Array.from({ length: K }, (_, j) =>
          logAlpha[t - 1][j] + Math.log(A[j][k] + 1e-300)
        );
        logAlpha[t][k] = lse(incoming) + logB[t][k];
      }
    }

    const logLik = lse(logAlpha[T - 1]);

    // Backward log-probabilities [T × K]
    const logBeta: number[][] = Array.from({ length: T }, () =>
      new Array(K).fill(0) // log(1) = 0
    );
    for (let t = T - 2; t >= 0; t--) {
      for (let j = 0; j < K; j++) {
        const outgoing = Array.from({ length: K }, (_, k) =>
          Math.log(A[j][k] + 1e-300) + logB[t + 1][k] + logBeta[t + 1][k]
        );
        logBeta[t][j] = lse(outgoing);
      }
    }

    // Posterior gamma [T × K]
    const gamma: number[][] = Array.from({ length: T }, (_, t) => {
      const raw = Array.from({ length: K }, (_, k) => logAlpha[t][k] + logBeta[t][k]);
      const norm = lse(raw);
      return raw.map(v => Math.exp(v - norm));
    });

    // Expected transition counts [K × K]
    const xiSum: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let t = 0; t < T - 1; t++) {
      const logXi: number[][] = Array.from({ length: K }, (_, j) =>
        Array.from({ length: K }, (_, k) =>
          logAlpha[t][j] +
          Math.log(A[j][k] + 1e-300) +
          logB[t + 1][k] +
          logBeta[t + 1][k]
        )
      );
      const norm = lse(logXi.flat());
      for (let j = 0; j < K; j++)
        for (let k = 0; k < K; k++)
          xiSum[j][k] += Math.exp(logXi[j][k] - norm);
    }

    // --- M-step ---

    // Update pi
    const piSum = gamma[0].reduce((a, b) => a + b, 0);
    for (let k = 0; k < K; k++) pi[k] = gamma[0][k] / (piSum + 1e-10);

    // Update A
    for (let j = 0; j < K; j++) {
      const rowSum = xiSum[j].reduce((a, b) => a + b, 0);
      for (let k = 0; k < K; k++)
        A[j][k] = rowSum > 1e-10 ? xiSum[j][k] / rowSum : 1 / K;
    }

    // Update mu, sigma
    for (let k = 0; k < K; k++) {
      const gk = gamma.map(row => row[k]);
      const gkSum = gk.reduce((a, b) => a + b, 0);
      if (gkSum < 1e-10) continue;
      for (let d = 0; d < D; d++) {
        const newMu = gk.reduce((s, g, t) => s + g * obs[t][d], 0) / gkSum;
        const newVar = gk.reduce((s, g, t) => s + g * (obs[t][d] - newMu) ** 2, 0) / gkSum;
        mu[k][d] = newMu;
        sigma[k][d] = Math.max(0.02, newVar); // variance floor
      }
    }

    if (Math.abs(logLik - prevLogLik) < tol && iter >= 5) break;
    prevLogLik = logLik;
  }

  return { params, logLikelihood: prevLogLik, iterations };
}

/**
 * Viterbi algorithm — returns the MAP state sequence.
 */
export function viterbiDecode(obs: number[][], params: HMMParams): number[] {
  const { pi, A, mu, sigma } = params;
  const T = obs.length;
  const K = pi.length;

  const logDelta: number[][] = Array.from({ length: T }, () => new Array(K).fill(-Infinity));
  const psi: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));

  for (let k = 0; k < K; k++)
    logDelta[0][k] = Math.log(pi[k] + 1e-300) + gaussLogPdf(obs[0], mu[k], sigma[k]);

  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let best = -Infinity;
      let bestJ = 0;
      for (let j = 0; j < K; j++) {
        const v = logDelta[t - 1][j] + Math.log(A[j][k] + 1e-300);
        if (v > best) { best = v; bestJ = j; }
      }
      logDelta[t][k] = best + gaussLogPdf(obs[t], mu[k], sigma[k]);
      psi[t][k] = bestJ;
    }
  }

  const path = new Array(T).fill(0);
  path[T - 1] = logDelta[T - 1].indexOf(Math.max(...logDelta[T - 1]));
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];

  return path;
}

/**
 * Forward-Backward — returns posterior P(state=k | all obs) for each t.
 * Returns [T × K] matrix of probabilities.
 */
export function forwardBackward(obs: number[][], params: HMMParams): number[][] {
  const { pi, A, mu, sigma } = params;
  const T = obs.length;
  const K = pi.length;

  const logB: number[][] = obs.map(ot =>
    Array.from({ length: K }, (_, k) => gaussLogPdf(ot, mu[k], sigma[k]))
  );

  const logAlpha: number[][] = Array.from({ length: T }, () => new Array(K).fill(-Infinity));
  for (let k = 0; k < K; k++)
    logAlpha[0][k] = Math.log(pi[k] + 1e-300) + logB[0][k];
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      const v = Array.from({ length: K }, (_, j) =>
        logAlpha[t - 1][j] + Math.log(A[j][k] + 1e-300)
      );
      logAlpha[t][k] = lse(v) + logB[t][k];
    }
  }

  const logBeta: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let t = T - 2; t >= 0; t--) {
    for (let j = 0; j < K; j++) {
      const v = Array.from({ length: K }, (_, k) =>
        Math.log(A[j][k] + 1e-300) + logB[t + 1][k] + logBeta[t + 1][k]
      );
      logBeta[t][j] = lse(v);
    }
  }

  return Array.from({ length: T }, (_, t) => {
    const raw = Array.from({ length: K }, (_, k) => logAlpha[t][k] + logBeta[t][k]);
    const norm = lse(raw);
    return raw.map(v => Math.exp(v - norm));
  });
}

/**
 * Re-order states so that state 0 = "best" (expansion-like) and
 * state K-1 = "worst" (stress-like), ranked by composite mu score.
 * All features must already be oriented so that positive = expansion.
 */
export function reorderByHealth(result: HMMFitResult): {
  params: HMMParams;
  originalOrder: number[]; // originalOrder[newIdx] = oldIdx
} {
  const { params } = result;
  const K = params.mu.length;

  const scores = Array.from({ length: K }, (_, k) => ({
    k,
    score: params.mu[k].reduce((s, v) => s + v, 0),
  })).sort((a, b) => b.score - a.score); // descending: best first

  const order = scores.map(s => s.k);

  const reArr = <T>(arr: T[]): T[] => order.map(k => arr[k]);
  const reArr2d = (arr: number[][]): number[][] =>
    order.map(j => order.map(k => arr[j][k]));

  return {
    params: {
      pi: reArr(params.pi),
      A: reArr2d(params.A),
      mu: reArr(params.mu),
      sigma: reArr(params.sigma),
    },
    originalOrder: order,
  };
}

/**
 * Remap a state path from old state indices to new state indices.
 * (Use after reorderByHealth if you decoded with the old params.)
 */
export function remapPath(path: number[], originalOrder: number[]): number[] {
  const inv = new Array(originalOrder.length);
  originalOrder.forEach((orig, newIdx) => { inv[orig] = newIdx; });
  return path.map(s => inv[s]);
}
