import './module.js';

import { toStaTimestamp, timeWindow } from './time.js';

/**
 * The server offers no aggregation - this FROST build rejects `$apply` - so
 * availability is counted one bucket at a time. Each answer is 30 bytes, but
 * each is also a request, so the volume is capped in two ways:
 *
 * - only this many run at once, leaving the browser's connection pool free for
 *   the map's own tiles and feature requests
 * - a whole month costs one request per day, not per day and sensor: the
 *   `Observations` collection is queried across all datastreams at once
 */
const MAX_CONCURRENCY = 4;

/**
 * `Datastream/id in (...)` grows with the number of sensors. Past this many the
 * filter is dropped rather than risking a url the server truncates or rejects;
 * availability is then reported for the whole service instead of the layer,
 * which is a wrong answer, so it is better to report nothing.
 */
const MAX_IDS_IN_FILTER = 300;

/**
 * Run `worker` over `items`, at most `limit` at a time.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} worker
 * @return {Promise<R[]>}
 */
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;

    async function run() {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await worker(items[index]);
        }
    }

    await Promise.all(Array.from({length: Math.min(limit, items.length)}, run));
    return results;
}

/**
 * @param {Date} start
 * @param {Date} end
 * @return {string}
 */
function rangeFilter(start, end) {
    return `phenomenonTime ge ${toStaTimestamp(start)} and phenomenonTime lt ${toStaTimestamp(end)}`;
}

angular.module('anol.timeseries')

    /**
     * @ngdoc object
     * @name anol.timeseries.TimeSeriesAvailabilityService
     *
     * @description
     * Answers "which times actually carry data" for a time series layer, so the
     * picker can grey out the rest. Both answers are scoped to a set of
     * datastream ids, which is how the viewport filter takes effect: the caller
     * passes only the sensors currently in view.
     *
     * Results are cached per layer, id set and period. Requests are abortable,
     * because rapid clicking through months would otherwise queue work nobody
     * is waiting for any more.
     */
    .service('TimeSeriesAvailabilityService', function() {
        /** @type {Map<string, Promise<any>>} */
        const cache = new Map();
        /** @type {Set<AbortController>} */
        const inFlight = new Set();

        function idFilter(datastreamIds) {
            if (datastreamIds.length === 0 || datastreamIds.length > MAX_IDS_IN_FILTER) {
                return undefined;
            }
            return `Datastream/id in (${datastreamIds.join(',')})`;
        }

        /**
         * @param {anol.layer.SensorThings} layer
         * @param {Record<string, string>} params
         * @param {AbortSignal} signal
         */
        async function request(layer, params, signal) {
            const response = await fetch(layer.observationsUrl(params), {signal});
            if (!response.ok) {
                throw new Error(`Could not fetch SensorThings availability. Status: ${response.status}`);
            }
            return response.json();
        }

        function cached(key, produce) {
            if (cache.has(key)) {
                return cache.get(key);
            }
            const controller = new AbortController();
            inFlight.add(controller);
            const promise = produce(controller.signal)
                .catch(error => {
                    // a superseded request is not a failure, but it must not
                    // be cached as an answer either
                    cache.delete(key);
                    if (error.name === 'AbortError') {
                        return undefined;
                    }
                    throw error;
                })
                .finally(() => inFlight.delete(controller));
            cache.set(key, promise);
            return promise;
        }

        return {
            /**
             * Which days of a month carry at least one observation.
             *
             * @param {anol.layer.SensorThings} layer
             * @param {number} year
             * @param {number} month zero-based, as in Date
             * @param {number[]} datastreamIds
             * @return {Promise<Set<number>|undefined>} days of the month, 1-based
             */
            daysWithData(layer, year, month, datastreamIds) {
                const ids = idFilter(datastreamIds);
                if (ids === undefined) {
                    return Promise.resolve(undefined);
                }
                const key = `days|${layer.name}|${ids}|${year}-${month}`;

                return cached(key, async function(signal) {
                    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
                    const days = Array.from({length: dayCount}, (_, i) => i + 1);

                    const counts = await mapLimit(days, MAX_CONCURRENCY, async function(day) {
                        const filter = `${ids} and ${rangeFilter(
                            new Date(Date.UTC(year, month, day)),
                            new Date(Date.UTC(year, month, day + 1))
                        )}`;
                        const data = await request(layer, {
                            '$filter': filter,
                            '$count': 'true',
                            '$top': '0'
                        }, signal);
                        return data['@iot.count'];
                    });

                    const available = new Set();
                    counts.forEach((count, index) => {
                        if (count > 0) {
                            available.add(days[index]);
                        }
                    });
                    return available;
                });
            },

            /**
             * Which buckets of one day carry at least one observation.
             *
             * Unlike the day view this is a single request: the day's
             * timestamps are fetched in the compact `dataArray` form and
             * bucketed here, which is both cheaper and exact.
             *
             * @param {anol.layer.SensorThings} layer
             * @param {Date} day any instant within the day
             * @param {{unit: string, count: number}} granularity
             * @param {number[]} datastreamIds
             * @return {Promise<Set<number>|undefined>} bucket start times, epoch ms
             */
            bucketsWithData(layer, day, granularity, datastreamIds) {
                const ids = idFilter(datastreamIds);
                if (ids === undefined) {
                    return Promise.resolve(undefined);
                }
                const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
                const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
                const key = `buckets|${layer.name}|${ids}|${start.getTime()}|${granularity.unit}${granularity.count}`;

                return cached(key, async function(signal) {
                    const data = await request(layer, {
                        '$filter': `${ids} and ${rangeFilter(start, end)}`,
                        '$select': 'phenomenonTime',
                        '$resultFormat': 'dataArray',
                        '$top': '20000'
                    }, signal);

                    const buckets = new Set();
                    for (const entry of data.value || []) {
                        const column = (entry.components || []).indexOf('phenomenonTime');
                        if (column === -1) {
                            continue;
                        }
                        for (const row of entry.dataArray || []) {
                            // an observation may carry an interval; its start
                            // is the bucket it belongs to
                            const stamp = new Date(String(row[column]).split('/')[0]);
                            if (isNaN(stamp.getTime())) {
                                continue;
                            }
                            buckets.add(timeWindow(stamp, granularity).start.getTime());
                        }
                    }
                    return buckets;
                });
            },

            /**
             * Abort everything still running. Called when the dialog closes, so
             * a month the user has navigated away from stops costing requests.
             */
            cancelPending() {
                inFlight.forEach(controller => controller.abort());
                inFlight.clear();
            },

            clearCache() {
                cache.clear();
            }
        };
    });
