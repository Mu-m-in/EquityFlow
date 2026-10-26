const moneyFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatMoney = (value) =>
  Number.isFinite(value) ? `₹${moneyFormatter.format(value)}` : "—";

export const formatPercent = (value) =>
  Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
