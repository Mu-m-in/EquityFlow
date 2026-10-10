const PAPER_STARTING_CASH = Number(process.env.PAPER_STARTING_CASH || 100000);

if (!Number.isFinite(PAPER_STARTING_CASH) || PAPER_STARTING_CASH <= 0) {
  throw new Error("PAPER_STARTING_CASH must be a positive number");
}

module.exports = { PAPER_STARTING_CASH };
