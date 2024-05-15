import { Path } from "./app";

/**
 * A directed path between two stations
 */
export type link = {
    from: string;
    to: string;
    path: Path;
};


