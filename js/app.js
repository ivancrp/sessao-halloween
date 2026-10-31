const state = {
  movies: [],
  counts: {},
  leaders: [],
  total: 0,
  yourVote: null,
  pending: false,
  built: false,
  ballotVersion: 0,
};

const grid = document.querySelector("#grid");
const ranking = document.querySelector("#ranking");
const now = document.querySelector("#now");
const status = document.querySelector("#status");
const VOTER_KEY = "sessao-halloween-voter";

function voterId() {
  const saved = localStorage.getItem(VOTER_KEY);
  if (saved) return saved;
  const created = createId();
  localStorage.setItem(VOTER_KEY, created);
  return created;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function votesLabel(count) {
  return count === 1 ? "1 voto" : `${count} votos`;
}

function movieById(id) {
  return state.movies.find((movie) => movie.id === id);
}

function setStatus(message) {
  status.textContent = message;
}

function applyBallot(ballot) {
  state.counts = ballot.counts || {};
  state.leaders = ballot.leaders || [];
  state.total = ballot.total || 0;
  state.yourVote = ballot.yourVote || null;
  renderNow();
  renderRanking();
  if (state.built) updateCards();
}

function joinNames(names) {
  if (names.length < 2) return names[0] || "um filme";
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function renderNow() {
  if (state.total === 0) {
    now.textContent = "Ninguém votou ainda. O primeiro voto escolhe o filme da noite.";
    return;
  }
  const names = state.leaders.map((id) => movieById(id)?.title).filter(Boolean);
  const top = state.counts[state.leaders[0]] || 0;
  if (names.length > 1) {
    now.textContent = `Empate: ${joinNames(names)} · ${votesLabel(top)} cada`;
    return;
  }
  now.textContent = `Filme da sessão: ${names[0]} · ${votesLabel(top)}`;
}

function renderRanking() {
  ranking.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "Placar";
  ranking.append(title);

  if (state.total === 0) {
    const empty = document.createElement("p");
    empty.className = "rank-empty";
    empty.textContent = "A sessão ainda está sem filme. Escolhe um card e vota.";
    ranking.append(empty);
    return;
  }

  const ordered = [...state.movies]
    .filter((movie) => (state.counts[movie.id] || 0) > 0)
    .sort((a, b) => {
      const diff = (state.counts[b.id] || 0) - (state.counts[a.id] || 0);
      return diff || state.movies.indexOf(a) - state.movies.indexOf(b);
    });
  const list = document.createElement("ol");
  ordered.slice(0, 3).forEach((movie, index) => {
    const item = document.createElement("li");
    item.className = "rank";
    const place = document.createElement("em");
    place.textContent = `${index + 1}º lugar`;
    const name = document.createElement("strong");
    name.textContent = movie.title;
    const count = document.createElement("span");
    count.textContent = votesLabel(state.counts[movie.id] || 0);
    item.append(place, name, count);
    list.append(item);
  });
  ranking.append(list);
}

function buildCards() {
  grid.replaceChildren();
  for (const movie of state.movies) {
    grid.append(createCard(movie));
  }
  state.built = true;
  updateCards();
}

function createCard(movie) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = movie.id;

  const thumb = document.createElement("button");
  thumb.className = "thumb";
  thumb.type = "button";
  thumb.dataset.trailer = movie.id;
  thumb.setAttribute("aria-label", `Ver trailer de ${movie.title}`);
  const image = document.createElement("img");
  image.src = `https://i.ytimg.com/vi/${movie.youtubeId}/hqdefault.jpg`;
  image.alt = "";
  const play = document.createElement("span");
  play.className = "play";
  play.textContent = "Ver trailer";
  thumb.append(image, play);

  const frame = document.createElement("div");
  frame.className = "frame";
  frame.dataset.frame = movie.id;
  frame.hidden = true;

  const body = document.createElement("div");
  body.className = "body";
  const heading = document.createElement("h2");
  heading.textContent = movie.title;
  const original = document.createElement("p");
  original.className = "original";
  original.textContent = movie.original;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${movie.year} · ${movie.mood}`;
  const blurb = document.createElement("p");
  blurb.className = "blurb";
  blurb.textContent = movie.blurb;

  const row = document.createElement("div");
  row.className = "vote-row";
  const vote = document.createElement("button");
  vote.className = "vote";
  vote.type = "button";
  vote.dataset.vote = movie.id;
  const count = document.createElement("span");
  count.className = "count";
  count.dataset.count = movie.id;
  row.append(vote, count);
  body.append(heading, original, meta, blurb, row);
  card.append(thumb, frame, body);
  return card;
}

function updateCards() {
  for (const movie of state.movies) {
    const card = grid.querySelector(`[data-id="${CSS.escape(movie.id)}"]`);
    if (!card) continue;
    const count = state.counts[movie.id] || 0;
    const selected = state.yourVote === movie.id;
    const leading = state.total > 0 && state.leaders.includes(movie.id);
    card.classList.toggle("is-yours", selected);
    card.classList.toggle("is-leader", leading);
    const button = card.querySelector("[data-vote]");
    button.disabled = state.pending;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.textContent = selected ? "É o meu voto" : state.yourVote ? "Trocar para esse" : "Quero esse";
    card.querySelector("[data-count]").textContent = votesLabel(count);
  }
}

function closeTrailers() {
  grid.querySelectorAll("[data-frame]").forEach((frame) => {
    frame.hidden = true;
    frame.replaceChildren();
  });
  grid.querySelectorAll(".thumb").forEach((thumb) => {
    thumb.hidden = false;
  });
}

function openTrailer(movieId) {
  const movie = movieById(movieId);
  const card = grid.querySelector(`[data-id="${CSS.escape(movieId)}"]`);
  if (!movie || !card || !/^[A-Za-z0-9_-]{11}$/.test(movie.youtubeId)) return;
  const alreadyOpen = !card.querySelector("[data-frame]").hidden;
  closeTrailers();
  if (alreadyOpen) return;

  const frame = card.querySelector("[data-frame]");
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube-nocookie.com/embed/${movie.youtubeId}?autoplay=1&rel=0`;
  iframe.title = `Trailer de ${movie.title}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  frame.append(iframe);
  frame.hidden = false;
  card.querySelector(".thumb").hidden = true;
}

async function refreshBallot() {
  const version = state.ballotVersion;
  const response = await fetch(`/api/votes?voterId=${encodeURIComponent(voterId())}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("load");
  if (version !== state.ballotVersion) return;
  applyBallot(await response.json());
}

async function vote(movieId) {
  if (state.pending || state.yourVote === movieId) return;
  state.pending = true;
  state.ballotVersion += 1;
  const version = state.ballotVersion;
  updateCards();
  setStatus("Registrando seu voto...");
  try {
    const response = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: voterId(), movieId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "vote");
    if (version !== state.ballotVersion) return;
    applyBallot(payload);
    const chosen = movieById(movieId);
    setStatus(`Voto em ${chosen ? chosen.title : "o filme"} registrado.`);
  } catch (error) {
    const known = [
      "Filme inválido",
      "Voto inválido",
      "A sessão já recebeu votos demais",
      "Não consegui registrar o voto",
    ];
    setStatus(known.includes(error.message) ? error.message : "Não consegui registrar o voto. Tenta de novo.");
  } finally {
    state.pending = false;
    updateCards();
  }
}

grid.addEventListener("click", (event) => {
  const voteButton = event.target.closest("[data-vote]");
  if (voteButton) {
    vote(voteButton.dataset.vote);
    return;
  }
  const trailerButton = event.target.closest("[data-trailer]");
  if (trailerButton) openTrailer(trailerButton.dataset.trailer);
});

async function start() {
  try {
    const response = await fetch("/data/movies.json");
    if (!response.ok) throw new Error("movies");
    const payload = await response.json();
    state.movies = payload.movies;
    buildCards();
    try {
      await refreshBallot();
    } catch (error) {
      setStatus("Os filmes abriram, mas o placar não carregou.");
    }
    setInterval(() => {
      if (!state.pending) refreshBallot().catch(() => {});
    }, 6000);
  } catch (error) {
    now.textContent = "A sessão não abriu.";
    setStatus("Não consegui carregar os filmes.");
  }
}

start();
