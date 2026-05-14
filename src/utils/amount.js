/**
 *
 * @param {BigInt | string | number} value
 */
function toMinor(value) {
  if (value === null || value === undefined || value === "") return null;

  const str = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\u00A0/g, "")
    .replace(",", ".");

  if (!/^\d+(\.\d{1,})?$/.test(str)) return null;

  if (!str.includes(".")) return BigInt(str) * 100n;

  const [whole, fraction = "0"] = str.split(".");
  const normalizedFraction = (fraction + "00").slice(0, 2);

  return BigInt(whole) * 100n + BigInt(normalizedFraction);
}

/**
 *
 * @param {BigInt | string | number} value
 * @param {Object} options
 * @param {boolean} [options.format=false]
 * @param {string} [options.locale='uz-UZ']
 * @param {number} [options.fractionDigits=2]
 */
function toMajor(value, options = {}) {
  const { format = false, locale = "uz-UZ", fractionDigits = 2 } = options;

  if (value === null || value === undefined) return null;

  const numValue = typeof value === "bigint" ? Number(value) / 100 : Number(value);

  if (Number.isNaN(numValue)) return null;
  if (!format) return numValue;

  return numValue.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function fromMinorUnits(tiyin = null) {
  if (!tiyin) return 0;
  return !Number.isNaN(Number(tiyin)) && Number(tiyin) !== 0 ? Number(tiyin) / 100 : 0;
}

module.exports = { toMinor, toMajor, fromMinorUnits };
