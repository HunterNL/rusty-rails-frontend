import { differenceInMilliseconds, startOfDay } from "date-fns";

const TOTAL_SECONDS_IN_DAY = 24 * 60 * 60

export function elapsedDaySeconds() {
    const localMidnight = startOfDay(new Date());
    const elapsedDaySeconds = differenceInMilliseconds(new Date(), localMidnight) / 1000;
    return elapsedDaySeconds;
}

export function formatDaySeconds(dayOffset: number): string {
    const secondsIntoDay = dayOffset % TOTAL_SECONDS_IN_DAY
    const hours = Math.floor(secondsIntoDay / 3600)
    const secondsIntoHour = (secondsIntoDay - hours * 3600)
    const minutes = secondsIntoHour / 60;
    return hours.toString(10).padStart(2, "0") + ":" + minutes.toString(10).padStart(2, "0")
}
