import { differenceInMilliseconds, startOfDay } from "date-fns";

const MILISECOND = 1;
const SECOND = MILISECOND * 1000;
const MINUTE = SECOND * 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;

export function asSeconds(a:number): number {
    return a / SECOND
}

export function fromSeconds(a:number): number {
    return a * SECOND
}


export function currentDayOffset(): number {
    // TODO Timezone awareness, dayoffset should always be Europe/Amsterdam
    const localMidnight = startOfDay(new Date());
    const elapsedDaySeconds = differenceInMilliseconds(new Date(), localMidnight);
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
