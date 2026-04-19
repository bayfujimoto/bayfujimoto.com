// Ported from old-wordpress-clone: src/_data/timezoneUtils.js
// Letterboxd watchedDate is YYYY-MM-DD in the user's local time.
// Parsing as noon Central Time avoids off-by-one-day errors from UTC offset.

const CENTRAL_TIMEZONE = "America/Chicago";

function getDateInCentralTime(date) {
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) throw new Error(`Invalid date: ${date}`);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(dateObj);
  const year = parseInt(parts.find((p) => p.type === "year").value);
  const month = parseInt(parts.find((p) => p.type === "month").value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day").value);

  return {
    year,
    month,
    day,
    dateString: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function formatDateCentral(date) {
  return getDateInCentralTime(date).dateString;
}

// Convert a Letterboxd watchedDate string (YYYY-MM-DD) to a Central Time date string.
// Parses as noon Central Time to avoid timezone boundary issues.
function watchedDateToCentral(watchedDateStr) {
  const iso = `${watchedDateStr}T12:00:00-06:00`;
  return formatDateCentral(new Date(iso));
}

export { getDateInCentralTime, formatDateCentral, watchedDateToCentral, CENTRAL_TIMEZONE };
