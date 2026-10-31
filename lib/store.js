const fs = require("fs/promises");
const path = require("path");

const VOTES_FILE = path.join(__dirname, "..", "storage", "votes.json");
const MOVIES_FILE = path.join(__dirname, "..", "data", "movies.json");
const GITHUB_PATH = "storage/votes.json";
const VOTER_LIMIT = 300;

let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

function useGitHub() {
  return Boolean(process.env.GITHUB_TOKEN);
}

function githubConfig() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || "ivancrp",
    repo: process.env.GITHUB_REPO || "sessao-halloween",
    branch: process.env.GITHUB_BRANCH || "main",
  };
}

async function loadMovies() {
  const raw = await fs.readFile(MOVIES_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.movies)) {
    throw new Error("Lista de filmes inválida");
  }
  return parsed.movies;
}

function allowedIds(movies) {
  return new Set(movies.map((movie) => movie.id));
}

function sanitize(votes, allowed) {
  const clean = {};
  if (!votes || typeof votes !== "object") return clean;
  for (const [voterId, movieId] of Object.entries(votes)) {
    if (typeof voterId === "string" && allowed.has(movieId)) {
      clean[voterId] = movieId;
    }
  }
  return clean;
}

async function readFromDisk() {
  try {
    const raw = await fs.readFile(VOTES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return { votes: parsed.votes || {}, sha: null };
  } catch (error) {
    if (error.code === "ENOENT") return { votes: {}, sha: null };
    throw error;
  }
}

async function writeToDisk(votes) {
  await fs.mkdir(path.dirname(VOTES_FILE), { recursive: true });
  await fs.writeFile(VOTES_FILE, JSON.stringify({ votes }, null, 2), "utf8");
}

async function githubRequest(config, method, body) {
  const url = new URL(
    `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${GITHUB_PATH}`
  );
  if (method === "GET") url.searchParams.set("ref", config.branch);

  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "User-Agent": "sessao-halloween",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (method === "GET" && response.status === 404) {
    return { missing: true };
  }

  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 || response.status === 422) {
    const error = new Error("conflict");
    error.code = "CONFLICT";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("github");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function readFromGitHub() {
  const payload = await githubRequest(githubConfig(), "GET");
  if (payload.missing) return { votes: {}, sha: null };
  const encoded = String(payload.content || "").replace(/\n/g, "");
  const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  return { votes: parsed.votes || {}, sha: payload.sha };
}

async function writeToGitHub(votes, sha) {
  const config = githubConfig();
  const body = {
    message: "Registra voto da sessão de Halloween",
    content: Buffer.from(JSON.stringify({ votes }, null, 2)).toString("base64"),
    branch: config.branch,
  };
  if (sha) body.sha = sha;
  await githubRequest(config, "PUT", body);
}

async function readBallot() {
  return useGitHub() ? readFromGitHub() : readFromDisk();
}

async function writeBallot(votes, sha) {
  if (useGitHub()) {
    await writeToGitHub(votes, sha);
    return;
  }
  await writeToDisk(votes);
}

function summarize(votes, movies, voterId) {
  const counts = {};
  for (const movie of movies) counts[movie.id] = 0;
  for (const movieId of Object.values(votes)) {
    if (counts[movieId] !== undefined) counts[movieId] += 1;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const max = total > 0 ? Math.max(...Object.values(counts)) : 0;
  const leaders = total > 0 ? movies.filter((movie) => counts[movie.id] === max).map((movie) => movie.id) : [];
  return {
    counts,
    total,
    leaders,
    yourVote: voterId && votes[voterId] ? votes[voterId] : null,
  };
}

function forViewer(summary) {
  if (summary.yourVote) return summary;
  return { counts: {}, total: 0, leaders: [], yourVote: null };
}

async function currentSummary(voterId) {
  return enqueue(async () => {
    const movies = await loadMovies();
    const ballot = await readBallot();
    const votes = sanitize(ballot.votes, allowedIds(movies));
    return forViewer(summarize(votes, movies, voterId));
  });
}

async function saveVote(voterId, movieId) {
  return enqueue(async () => {
    const movies = await loadMovies();
    const allowed = allowedIds(movies);
    if (!allowed.has(movieId)) {
      const error = new Error("invalid");
      error.code = "INVALID";
      throw error;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ballot = await readBallot();
      const votes = sanitize(ballot.votes, allowed);
      const isNew = !Object.prototype.hasOwnProperty.call(votes, voterId);
      if (isNew && Object.keys(votes).length >= VOTER_LIMIT) {
        const error = new Error("limit");
        error.code = "LIMIT";
        throw error;
      }
      votes[voterId] = movieId;
      try {
        await writeBallot(votes, ballot.sha);
        return summarize(votes, movies, voterId);
      } catch (error) {
        if (error.code !== "CONFLICT") throw error;
      }
    }

    const error = new Error("conflict");
    error.code = "CONFLICT";
    throw error;
  });
}

module.exports = { currentSummary, saveVote };
