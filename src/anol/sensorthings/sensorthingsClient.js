import {
    isString,
    isNumber,
    isBoolean,
    isNull,
    isArray,
    isPlainObject,
    isEmpty
} from 'lodash';

import { toStaTimestamp } from '../../modules/timeseries/time.js';

const TIME_PLACEHOLDER_PATTERN = /\{time(Start|End|Filter)\}/;

/**
 * Split an `$expand` on its top-level commas, ignoring those nested inside the
 * parenthesised options of a term.
 *
 * @param {string} expand
 * @return {string[]}
 */
function splitExpandTerms(expand) {
    const terms = [];
    let depth = 0;
    let current = '';
    for (const char of expand) {
        if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
            terms.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    terms.push(current);
    return terms.filter(term => term.trim() !== '');
}

/**
 * Drop the terms that pull location geometry, keeping everything else a config
 * asked for - a refresh still needs `Observations`, and may need `Sensor` or
 * anything else feature info addresses.
 *
 * @param {string} expand
 * @return {string}
 */
function stripLocationExpand(expand) {
    return splitExpandTerms(expand)
        .filter(term => !/^\s*Thing\/Locations\b/i.test(term))
        .join(',');
}

/**
 * The location to draw a datastream at.
 *
 * @param {Array<{location?: Object}>} locations
 * @return {Object|undefined}
 */
function pickLocation(locations) {
    const geometries = locations.map(entry => entry && entry.location).filter(Boolean);
    const point = geometries.find(geometry => geometry.type === 'Point' || geometry.type === 'MultiPoint');
    return point || geometries[0];
}

/**
 * Whether the configured url parameters carry at least one time placeholder.
 * A `timeSeries` layer without one would show a picker that silently does
 * nothing, so the layer warns about it at construction time.
 *
 * @param {{filter?: string, expand?: string}} urlParameters
 * @return {boolean}
 */
export function hasTimePlaceholder(urlParameters) {
    return TIME_PLACEHOLDER_PATTERN.test(urlParameters?.filter ?? '') ||
        TIME_PLACEHOLDER_PATTERN.test(urlParameters?.expand ?? '');
}

class SensorThingsClient {
    constructor(opts) {
        this.url = opts.url;
        this.urlParameters = opts.urlParameters;
        this.version = '1.1';

        /**
         * Selected time window, or `undefined` for "latest" - in which case the
         * placeholders collapse to nothing and the query reverts to its untimed
         * form. That is what lets startup use a single code path.
         * @type {{start: Date, end: Date}|undefined}
         */
        this.time = undefined;
    }

    /**
     * @param {{start: Date, end: Date}|undefined} time
     */
    setTime(time) {
        this.time = time;
    }

    /**
     * Substitute the time placeholders. Runs before `searchParams.set()`, which
     * takes care of the encoding.
     *
     * @param {string|undefined} value
     * @return {string|undefined}
     */
    resolvePlaceholders(value) {
        if (!value) {
            return value;
        }
        const start = this.time ? toStaTimestamp(this.time.start) : '';
        const end = this.time ? toStaTimestamp(this.time.end) : '';
        const timeFilter = this.time
            ? `$filter=phenomenonTime ge ${start} and phenomenonTime lt ${end};`
            : '';

        return value
            .replace(/\{timeStart\}/g, start)
            .replace(/\{timeEnd\}/g, end)
            .replace(/\{timeFilter\}/g, timeFilter);
    }

    /**
     * Base url for one of the service's collections.
     *
     * @param {string} root e.g. `Datastreams` or `Observations`
     * @return {{url: URL, isFullUrl: boolean}}
     */
    collectionUrl(root) {
        const isFullUrl = /^https?:\/\//.test(this.url);
        const url = isFullUrl ? new URL(this.url) : new URL(this.url, 'file://');
        if (url.pathname.endsWith('/')) {
            url.pathname = url.pathname.slice(0, -1);
        }
        if (!url.pathname.endsWith(`/v${this.version}/${root}`)) {
            url.pathname += `/v${this.version}/${root}`;
        }
        return {url, isFullUrl};
    }

    /**
     * A query against the `Observations` collection, used to find out which
     * times actually carry data.
     *
     * Availability filters by `Datastream/id`, never by rewriting the layer's
     * own `$filter`: that one is written against `Datastreams`, and turning an
     * arbitrary expression into its `Datastream/`-prefixed equivalent is not
     * something that can be done reliably.
     *
     * @param {Record<string, string>} params
     * @return {string}
     */
    createObservationsUrl(params) {
        const {url, isFullUrl} = this.collectionUrl('Observations');
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        return isFullUrl ? url.toString() : url.toString().replace('file://', '');
    }

    /**
     * @param {boolean} [withLocations] pass `false` for a refresh - so a poll that only wants the newest readings leaves
     * it out and the layer merges the values into the drawn features.
     * @return {string}
     */
    createUrl(withLocations = true) {
        const {url, isFullUrl} = this.collectionUrl('Datastreams');

        const filter = this.resolvePlaceholders(this.urlParameters.filter);
        if (filter) {
            url.searchParams.set('$filter', filter);
        }

        // If users provide custom expand, they have to ensure
        // that the location is included
        let expand = this.resolvePlaceholders(this.urlParameters.expand);
        if (!expand) {
            // Ensuring we will always get the location
            expand = `Thing/Locations, Observations(${this.resolvePlaceholders('{timeFilter}')}$orderby=phenomenonTime desc;$top=1)`;
        }
        if (!withLocations) {
            expand = stripLocationExpand(expand);
        }
        if (expand) {
            url.searchParams.set('$expand', expand);
        }

        return isFullUrl ? url.toString() : url.toString().replace('file://', '');
    }

    /**
     * The datastreams' properties keyed by `@iot.id`, for merging a refresh
     * into the drawn features without touching their geometry.
     *
     * @param {Object} data
     * @return {Map<string, Object>}
     */
    datastreamProperties(data) {
        const byId = new Map();
        for (const datastream of data.value) {
            const id = datastream['@iot.id'];
            if (id === undefined || id === null) {
                continue;
            }
            byId.set(String(id), this.flattenObject(datastream));
        }
        return byId;
    }

    async get(withLocations = true) {
        const url = this.createUrl(withLocations);
        let data = await this.sendRequest(url);
        if (data['@iot.nextLink']) {
            data = await this.resolveNextLink(data['@iot.nextLink'], data);
        }
        return data;
    }

    async sendRequest(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could  not fetch SensorThingsAPI data. Status: ${response.status}`);
        }
        return response.json();
    }

    async resolveNextLink(nextLink, data) {
        const response = await this.sendRequest(nextLink);
        const resolvedData = {
            ...data,
            value: [
                ...data.value,
                ...response.value
            ]
        };
        if (response['@iot.nextLink']) {
            return this.resolveNextLink(response['@iot.nextLink'], resolvedData);
        }
        return resolvedData;
    }

    datastreamToGeoJSON(datastream) {
        const observations = datastream.value;

        const features = observations.map(observation => {
            const thing = observation.Thing;
            const feature = {
                type: 'Feature',
                properties: {
                    ...this.flattenObject(observation)
                },
                geometry: pickLocation(thing.Locations || []),
            };
            return feature;
        });

        return {
            type: 'FeatureCollection',
            features
        };
    }

    // credits to https://stackoverflow.com/a/58314822
    flattenObject(o, prefix = '', result = {}, keepNull = true) {
        if (isString(o) || isNumber(o) || isBoolean(o) || (keepNull && isNull(o))) {
            result[prefix] = o;
            return result;
        }

        if (isArray(o) || isPlainObject(o)) {
            for (let i in o) {
            let pref = prefix;
            if (isArray(o)) {
                pref = pref + `.${i}`;
            } else {
                if (isEmpty(prefix)) {
                    pref = i;
                } else {
                    pref = prefix + '.' + i;
                }
            }
            this.flattenObject(o[i], pref, result, keepNull);
            }
            return result;
        }
        return result;
    }
}

export default SensorThingsClient;
