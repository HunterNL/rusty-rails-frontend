import { differenceInMilliseconds, startOfDay } from "date-fns";

const MILISECOND = 1;
const SECOND = MILISECOND * 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

export function asSeconds(a: number): number {
    return a / SECOND
}

export function fromSeconds(a: number): number {
    return a * SECOND
}

export function fromHourSecond(hour: number, seconds: number) {
    return hour * HOUR + seconds * SECOND
}

function convertTZ(date, tzString) {
    return new Date((typeof date === "string" ? new Date(date) : date).toLocaleString("en-US", { timeZone: tzString }));
}


export function currentDayOffset(): number {
    // TODO Timezone awareness, dayoffset should always be Europe/Amsterdam

    const now = convertTZ(new Date(), "Europe/Amsterdam")
    const localMidnight = startOfDay(now);
    const elapsedDaySeconds = differenceInMilliseconds(now, localMidnight);
    return elapsedDaySeconds;
}

export function formatDaySeconds(dayOffset_milliseconds: number): string {
    const secondsIntoDay = dayOffset_milliseconds % DAY;
    const hours = Math.floor(secondsIntoDay / HOUR)
    const secondsIntoHour = (secondsIntoDay - hours * HOUR)
    const minutes = Math.floor(secondsIntoHour / MINUTE);

    const hourString = hours.toString(10).padStart(2, "0")
    const minuteString = minutes.toString(10).padStart(2, "0");
    return hourString + ":" + minuteString
}


export function formatDaySecondsWithSeconds(dayOffset_milliseconds: number): string {
    const secondsIntoDay = dayOffset_milliseconds % DAY;
    const hours = Math.floor(secondsIntoDay / HOUR)
    const secondsIntoHour = (secondsIntoDay - hours * HOUR)
    const minutes = Math.floor(secondsIntoHour / MINUTE);
    const seconds = Math.floor((dayOffset_milliseconds % MINUTE) / SECOND);

    const hourString = hours.toString(10).padStart(2, "0")
    const minuteString = minutes.toString(10).padStart(2, "0");
    const secondsString = seconds.toString(10).padStart(2, '0');

    return hourString + ":" + minuteString + ":" + secondsString;
}
