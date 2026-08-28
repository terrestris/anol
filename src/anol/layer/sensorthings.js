import FeatureLayer from './feature';
import GeoJSON from 'ol/format/GeoJSON';
import { all } from 'ol/loadingstrategy';

import { intersects as extentsIntersect } from 'ol/extent';

import SensorThingsClient, { hasTimePlaceholder } from '../sensorthings/sensorthingsClient';
import { timeWindow, resolveConfiguredTime, parseInterval } from '../../modules/timeseries/time.js';

/**
 * Where each drawn datastream is and how far its data reaches.
 *
 * The bare `phenomenonTime` on a datastream is its whole temporal extent - not
 * to be confused with the `Observations.N.phenomenonTime` of an individual
 * reading, which is what newestObservationTime() looks at.
 *
 * @param {import('ol/Feature').default[]} features
 */
function readDatastreams(features) {
    return features.map(feature => {
        const geometry = feature.getGeometry();
        return {
            id: feature.get('@iot.id'),
            extent: geometry ? geometry.getExtent() : undefined,
            coverage: parseInterval(feature.get('phenomenonTime'))
        };
    }).filter(entry => entry.id !== undefined);
}

/**
 * The newest observation `phenomenonTime` across the drawn features, which is
 * what the map is actually showing. `datastreamToGeoJSON()` flattens the
 * observation, so the property arrives as e.g. `Observations.0.phenomenonTime`;
 * a datastream with several observations contributes several of them.
 *
 * The datastream itself also carries a bare `phenomenonTime` - its whole
 * temporal extent, which reaches to the present no matter which window was
 * requested - so only keys below `Observations` may be considered.
 *
 * @param {import('ol/Feature').default[]} features
 * @return {Date|undefined}
 */
function newestObservationTime(features) {
    let newest;
    for (const feature of features) {
        const properties = feature.getProperties();
        for (const key of Object.keys(properties)) {
            if (!key.includes('Observations') || !key.endsWith('phenomenonTime')) {
                continue;
            }
            const value = properties[key];
            if (typeof value !== 'string') {
                continue;
            }
            // phenomenonTime may be an interval "start/end"; the end is newer
            const parsed = new Date(value.split('/').pop());
            if (isNaN(parsed.getTime())) {
                continue;
            }
            if (newest === undefined || parsed > newest) {
                newest = parsed;
            }
        }
    }
    return newest;
}

// TODO support clustering
class SensorThings extends FeatureLayer {
    constructor(_options) {
        super(_options);
        this.CLASS_NAME = 'anol.layer.SensorThings';
        const DEFAULT_OPTS = {
            urlParameters: {
                filter: undefined,
                expand: undefined
            },
            refreshInterval: 5
        };
        this.urlParameters = $.extend(true, {}, DEFAULT_OPTS.urlParameters, _options.olLayer.source.urlParameters);
        this.url = _options.olLayer.source.url;
        this.refreshInterval = (_options.olLayer.source.refreshInterval ?? DEFAULT_OPTS.refreshInterval) * 1000;
        delete _options.olLayer.source;

        this.olLayerOptions = _options.olLayer;
        this.olLayer = undefined;
        this.saveable = false;
        this.editable = false;
        this.subscription = undefined;
        this.isWatching = false;
        this.mapProjection = undefined;

        /**
         * Selected time window, `undefined` for "latest".
         * @type {{start: Date, end: Date}|undefined}
         */
        this.time = undefined;
        this.viewportFilterActive = false;
        /** Newest phenomenonTime among the drawn features. */
        this.displayedTime = undefined;
        /**
         * One entry per drawn datastream: its id, where it is, and the extent
         * it covers. Feeds the picker's availability lookups.
         * @type {{id: number|string, extent: number[]|undefined, coverage: {start: Date, end: Date}|undefined}[]}
         */
        this.datastreams = [];
        /** Guards against a slow response overwriting a newer one. */
        this.loadToken = 0;

        if (this.hasTimeSeries()) {
            if (!hasTimePlaceholder(this.urlParameters)) {
                console.warn(`Layer "${this.name}" declares timeSeries but neither its source ` +
                    'filter nor its expand contains a {timeFilter}, {timeStart} or {timeEnd} ' +
                    'placeholder, so the time picker will have no effect.');
            }
            try {
                const instant = resolveConfiguredTime(this.timeSeries.default);
                if (instant !== undefined) {
                    this.time = timeWindow(instant, this.getGranularity());
                }
            } catch (error) {
                console.error(`Layer "${this.name}": ${error.message}`);
            }
        }

        if (this.hasViewportFilter()) {
            this.viewportFilterActive = this.viewportFilter.default === 'viewport';
        }
    }

    getTime() {
        return this.time;
    }

    getDisplayedTime() {
        return this.displayedTime;
    }

    /**
     * @return {Promise|undefined} resolves once the new data is drawn, so
     * callers can read getDisplayedTime()
     */
    setTime(time) {
        this.time = time;
        return this.reload();
    }

    getViewportFilter() {
        return this.viewportFilterActive;
    }

    /**
     * The viewport filter narrows which times the picker offers, not which
     * features are drawn, so flipping it triggers no reload.
     */
    setViewportFilter(active) {
        this.viewportFilterActive = active;
    }

    /**
     * Ids of the datastreams to consider when asking what data exists.
     *
     * With the viewport filter on, only those intersecting `viewExtent` count -
     * which is the whole point of it: a day that carries data somewhere else
     * entirely should not be offered as selectable here. Datastreams that never
     * reported are dropped either way; they would only ever answer "no data".
     *
     * @param {number[]} [viewExtent] in map projection; omit to consider all
     * @return {(number|string)[]}
     */
    getDatastreamIds(viewExtent) {
        return this.datastreams
            .filter(entry => {
                if (entry.coverage === undefined) {
                    return false;
                }
                if (viewExtent === undefined) {
                    return true;
                }
                return entry.extent !== undefined && extentsIntersect(entry.extent, viewExtent);
            })
            .map(entry => entry.id);
    }

    /**
     * Union of the temporal extents the datastreams report, which bounds the
     * picker before any counting has happened.
     *
     * @param {number[]} [viewExtent] in map projection; omit to consider all
     * @return {{start: Date, end: Date}|undefined}
     */
    getCoverage(viewExtent) {
        let start;
        let end;
        for (const entry of this.datastreams) {
            if (entry.coverage === undefined) {
                continue;
            }
            if (viewExtent !== undefined &&
                (entry.extent === undefined || !extentsIntersect(entry.extent, viewExtent))) {
                continue;
            }
            if (start === undefined || entry.coverage.start < start) {
                start = entry.coverage.start;
            }
            if (end === undefined || entry.coverage.end > end) {
                end = entry.coverage.end;
            }
        }
        return start === undefined ? undefined : {start, end};
    }

    /**
     * @param {Record<string, string>} params
     * @return {string}
     */
    observationsUrl(params) {
        return new SensorThingsClient({
            url: this.url,
            urlParameters: this.urlParameters
        }).createObservationsUrl(params);
    }

    /**
     * The single reload path. Time, viewport and the polling timer all end up
     * here, so they cannot race each other with three separate mechanisms.
     */
    reload() {
        if (this.olLayer === undefined) {
            return;
        }
        this.unsubscribe();
        return this.loadData();
    }

    createLoader() {
        var sensorThingsInst = this;
        return function (extent, resolution, projection, success, failure) {
            sensorThingsInst.mapProjection = projection;
            sensorThingsInst.loadData()
                .then(features => {
                    success(features);
                });
        };
    }

    subscribe() {
        // A fixed window in the past has nothing to poll for. Guarding here
        // covers both callers - loadData() and watchVisibility().
        if (this.time !== undefined) {
            return;
        }
        // never stack timers - visibility changes and reloads both land here
        this.unsubscribe();
        const sensorThingsInst = this;
        this.subscription = setTimeout(() => {
            // We cannot use vectorSource.refresh() here,
            // since there old features will be removed before
            // requesting new data. Our approach clears old
            // features after new data is loaded, which should address
            // for a smoother feeling.
            sensorThingsInst.loadData();
        }, this.refreshInterval);
    }

    unsubscribe() {
        if (this.subscription) {
            clearTimeout(this.subscription);
        }
    }

    watchVisibility() {
        if (this.isWatching) {
            return;
        }

        this.isWatching = true;
        const sensorThingsInst = this;

        this.olLayer.on('change:visible', function () {
            if (!sensorThingsInst.olLayer.getVisible()) {
                sensorThingsInst.unsubscribe();
            } else {
                sensorThingsInst.subscribe();
            }
        });
    }

    async loadData() {
        const client = new SensorThingsClient({
            url: this.url,
            urlParameters: this.urlParameters
        });
        client.setTime(this.time);

        const vectorSource = this.olLayer.getSource();

        this.loadToken += 1;
        const token = this.loadToken;

        let features;
        try {
            const data = await client.get();
            if (token !== this.loadToken) {
                // A newer request started while this one was in flight
                return features;
            }
            const featureCollection = client.datastreamToGeoJSON(data);
            features = vectorSource.getFormat()
                .readFeatures(featureCollection, {
                    featureProjection: this.mapProjection
                });
            vectorSource.clear(true);
            vectorSource.addFeatures(features);
            this.displayedTime = newestObservationTime(features);
            this.datastreams = readDatastreams(features);
        } finally {
            this.watchVisibility();
            if (token === this.loadToken) {
                this.subscribe();
            }
            return features;
        }
    }

    _createSourceOptions(srcOptions) {
        srcOptions.strategy = all;
        srcOptions.loader = this.createLoader();
        srcOptions.format = new GeoJSON();
        return super._createSourceOptions(srcOptions);
    }

    injectExternalGraphicPrefix(style) {
        if (!style) {
            return;
        }
        if (Array.isArray(style)) {
            style.forEach((s) => this.injectExternalGraphicPrefix(s.style), this);
        } else if (style['icon-src']) {
            style['icon-src'] = this.externalGraphicPrefix + style['icon-src'];
        }
    }

    setStyle(olLayer) {
        if (!this.style) {
            return;
        }
        const styleClone = structuredClone(this.style);
        this.injectExternalGraphicPrefix(styleClone);
        olLayer.setStyle(styleClone);
    }
}

export default SensorThings;
