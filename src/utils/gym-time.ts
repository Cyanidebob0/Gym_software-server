/**
 * Attendance dates and times are gym-local wall-clock values, but the server
 * cannot derive them from the host clock:
 *
 *   - `Date#toISOString()` is always UTC, whatever the host timezone is, so it
 *     reports the previous day for IST between 00:00 and 05:30.
 *   - `Date#toTimeString()` follows the host timezone, which is IST in local
 *     development but UTC on the deployed host — a 5.5 hour error in production
 *     that never reproduces locally.
 *
 * Pinning the zone here makes both environments agree. The installation is
 * single-gym (see CLAUDE.md), so the zone is a constant; if the gym ever moves
 * into `settings`, this is the only place that has to change.
 */
export const GYM_TIME_ZONE = 'Asia/Kolkata';

// en-CA formats as YYYY-MM-DD, matching the `date` column directly.
const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

// hourCycle h23 rather than hour12:false, which renders midnight as "24:00"
// on some Node builds.
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: GYM_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
});

/** Gym-local calendar day as YYYY-MM-DD. */
export const gymDateString = (date: Date = new Date()): string => dateFormatter.format(date);

/** Gym-local wall clock as HH:mm. */
export const gymTimeString = (date: Date = new Date()): string => timeFormatter.format(date);
