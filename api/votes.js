const { handleVoteRequest } = require("../lib/votes");

module.exports = function votes(req, res) {
  return handleVoteRequest(req, res);
};
