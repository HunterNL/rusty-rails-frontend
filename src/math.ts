
export const TRAIN_ACCELERATION_MS = 0.6;

// const MAX_SPEED = (140 / 3.6)
// const ACCELERATION_TIME = MAX_SPEED / TRAIN_ACCELERATION_MS
// const ACCELERATION_DISTANCE = 0.5 * TRAIN_ACCELERATION_MS * ACCELERATION_TIME * ACCELERATION_TIME


export type SpeedPosition = {
    speed: number,
    distance_fraction: number
}


export function distance_fraction_from_cruising_speed(leg_distance_m: number, leg_duration_s: number, running_speed_ms: number, time_fraction: number): SpeedPosition {
    const seconds_into_leg = leg_duration_s * time_fraction;

    const acceleration_time = running_speed_ms / TRAIN_ACCELERATION_MS;
    const acceleration_distance = 0.5 * TRAIN_ACCELERATION_MS * acceleration_time * acceleration_time;

    // Moment when cruise speed is reached
    const cruise_speed_moment = acceleration_time

    // Moment when breaking begins
    const deceleration_moment = leg_duration_s - acceleration_time;

    const cruise_duration = leg_duration_s - 2 * acceleration_time
    const cruise_distance = cruise_duration * running_speed_ms;

    // In initial acceleration
    if (seconds_into_leg < cruise_speed_moment) {
        const distance_spend_accelerating = 0.5 * TRAIN_ACCELERATION_MS * seconds_into_leg * seconds_into_leg
        return {
            distance_fraction: (acceleration_distance + distance_spend_accelerating) / leg_distance_m,
            speed: seconds_into_leg * TRAIN_ACCELERATION_MS
        }
    }

    // In main run at speed
    if (seconds_into_leg < deceleration_moment) {
        const time_at_max_speed = seconds_into_leg - acceleration_time
        return {
            distance_fraction: (acceleration_distance + running_speed_ms * time_at_max_speed) / leg_distance_m,
            speed: running_speed_ms
        }
    } else {
        const time_decelerating = seconds_into_leg - deceleration_moment
        const distance_under_deceleration = (running_speed_ms * time_decelerating) - 0.5 * TRAIN_ACCELERATION_MS * time_decelerating * time_decelerating

        return {
            distance_fraction: (acceleration_distance + cruise_distance + distance_under_deceleration) / leg_distance_m,
            speed: running_speed_ms - (time_decelerating * TRAIN_ACCELERATION_MS)
        }
    }

    throw new Error("Unexpected fallthrough")
}

export function distance_fraction_from_constant_acceleration(link_distance_m: number, link_duration_s: number, time_fraction: number): SpeedPosition {
    const halfway_moment = link_duration_s / 2;
    const halfway_position = link_distance_m / 2;
    const time_in_leg = link_duration_s * time_fraction;
    const peak_speed = halfway_moment * TRAIN_ACCELERATION_MS

    if (time_fraction < 0.5) {
        let distance_under_acceleration = 0.5 * TRAIN_ACCELERATION_MS * time_in_leg * time_in_leg;

        return {
            distance_fraction: distance_under_acceleration / link_distance_m,
            speed: time_in_leg * TRAIN_ACCELERATION_MS
        }


    } else {
        let time_into_deceleration = time_in_leg - halfway_moment;
        let distance_under_deceleration = (peak_speed * time_into_deceleration) - 0.5 * TRAIN_ACCELERATION_MS * time_into_deceleration * time_into_deceleration

        return {
            distance_fraction: (halfway_position + distance_under_deceleration) / link_distance_m,
            speed: peak_speed - time_into_deceleration * TRAIN_ACCELERATION_MS
        }
    }
}