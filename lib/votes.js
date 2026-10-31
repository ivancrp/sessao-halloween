const { currentSummary, saveVote } = require("./store");

const VOTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function voterFrom(value) {
  if (typeof value !== "string" || !VOTER_ID.test(value)) return null;
  return value.toLowerCase();
}

async function handleVoteRequest(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const voterId = voterFrom(url.searchParams.get("voterId"));
      send(res, 200, await currentSummary(voterId));
      return;
    }

    if (req.method !== "POST") {
      send(res, 405, { error: "Método não aceito" });
      return;
    }

    const body = await readBody(req);
    const voterId = voterFrom(body.voterId);
    const movieId = typeof body.movieId === "string" ? body.movieId : "";
    if (!voterId || !movieId) {
      send(res, 400, { error: "Voto inválido" });
      return;
    }

    send(res, 200, await saveVote(voterId, movieId));
  } catch (error) {
    if (error.code === "INVALID") {
      send(res, 400, { error: "Filme inválido" });
      return;
    }
    if (error.code === "LIMIT") {
      send(res, 429, { error: "A sessão já recebeu votos demais" });
      return;
    }
    if (error instanceof SyntaxError) {
      send(res, 400, { error: "Voto inválido" });
      return;
    }
    console.error("Falha na votação", error.status || error.code || "erro");
    send(res, 500, { error: "Não consegui registrar o voto" });
  }
}

module.exports = { handleVoteRequest };
