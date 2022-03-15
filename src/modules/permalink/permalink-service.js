import './module.js';
import {transform, transformExtent} from 'ol/proj';
import {getArrayParam, getObjectParam, getStringParam} from "./util";
import Group from "../../anol/layer/group";

/**
 * @typedef {Object} PermalinkFitParameters
 * @property {number[]} extent
 * @property {string} crs
 */

/**
 * @typedef {Object} PermalinkGeocodeParameters
 * @property {string} config
 * @property {string} term
 * @property {string} highlight
 * @property {string} label
 */

/**
 * @typedef {Object} PermalinkParameters
 * @property {number} zoom
 * @property {[number, number]} center
 * @property {string} crs
 * @property {string[]} layers
 * @property {string[]} catalogLayers
 * @property {string[]} [visibleCatalogLayers]
 * @property {string[]} [visibleCatalogGroups]
 * @property {string[]} catalogGroups
 * @property {Object} [fit]
 * @property {number[]} fit.extent
 * @property {string} fit.crs
 * @property {PermalinkGeocodeParameters} [geocode]
 * @property {string[]} groupOrder
 * @property {string[]} sidebar
 * @property {'open'|'closed'} sidebarStatus
 */

angular.module('anol.permalink')
    /**
     * @ngdoc object
     * @name PermalinkService
     */
    .provider('PermalinkService', [function () {
        /** @type {string} */
        let _urlCrs;
        let _precision = 100000;

        /**
         * @param {import('./util').UrlParams} params
         * @return {Partial<PermalinkParameters>}
         */
        const extractMapParams = function (params) {
            const mapParams = getArrayParam('map', params);
            const layers = getArrayParam('layers', params);
            const visibleCatalogLayers = getArrayParam('visibleCatalogLayers', params);
            const visibleCatalogGroups = getArrayParam('visibleCatalogGroups', params);
            const catalogLayers = getArrayParam('catalogLayers', params);
            const catalogGroups = getArrayParam('catalogGroups', params);
            const fitParams = getArrayParam('fit', params);
            const geocode = getObjectParam('geocode', params);
            const groupOrder = getArrayParam('groupOrder', params);
            const sidebar = getArrayParam('sidebar', params);
            const sidebarStatus = getStringParam('sidebarStatus', params);

            /**
             * @type {Partial<PermalinkParameters>}
             */
            const result = {
                layers,
                catalogLayers,
                visibleCatalogLayers,
                visibleCatalogGroups,
                catalogGroups,
                geocode: /** @type {PermalinkGeocodeParameters} */ (geocode),
                groupOrder,
                sidebar
            }

            if (mapParams !== undefined) {
                if (mapParams.length === 4) {
                    Object.assign(result, {
                        zoom: parseInt(mapParams[0]),
                        center: [parseFloat(mapParams[1]), parseFloat(mapParams[2])],
                        crs: mapParams[3]
                    });
                } else {
                    console.error('Url param `map` has incorrect number of arguments. ' +
                        'Expected: `map={zoom},{centerX},{centerY},{crs}`');
                }
            }

            if (fitParams !== undefined) {
                if (fitParams.length === 5) {
                    result.fit = {
                        extent: [fitParams[0], fitParams[1], fitParams[2], fitParams[3]].map(parseFloat),
                        crs: fitParams[4]
                    };

                } else {
                    console.error('Url param `fit` has incorrect number of arguments. Expected: ' +
                        '`fit={bboxMinX},{bboxMinY},{bboxMaxX},{bboxMaxY},{crs}`');
                }
            }

            if (angular.isDefined(sidebarStatus) && (sidebarStatus === 'open' || sidebarStatus === 'closed')) {
                result.sidebarStatus = sidebarStatus;
            }

            return result;
        };

        /**
         * @ngdoc method
         * @name setUrlCrs
         * @methodOf anol.permalink.PermalinkServiceProvider
         * @param {string} crs EPSG code of coordinates in url
         * @description
         * Define crs of coordinates in url
         */
        this.setUrlCrs = function (crs) {
            _urlCrs = crs;
        };

        /**
         * @ngdoc method
         * @name setPrecision
         * @methodOf anol.permalink.PermalinkServiceProvider
         * @param {number} precision Precision of coordinates in url
         * @description
         * Define precision of coordinates in url
         */
        this.setPrecision = function (precision) {
            _precision = precision;
        };

        this.$get = ['$rootScope', '$q', '$location', '$timeout', 'MapService', 'LayersService', 'CatalogService', 'ReadyService', 'GeocoderService',
            /**
             * @param {import('../../anol/rootScope').AnolRootScope} $rootScope
             * @param {import('angular').IQService} $q
             * @param {import('angular').ILocationService} $location
             * @param {import('angular').ITimeoutService} $timeout
             * @param {any} MapService
             * @param {any} LayersService
             * @param {any} CatalogService
             * @param {any} ReadyService
             * @param {any} GeocoderService
             * @return {Permalink}
             */
            function ($rootScope, $q, $location, $timeout, MapService, LayersService, CatalogService, ReadyService, GeocoderService) {

                /**
                 * @template T
                 * @param {T[]} newArray
                 * @param {T[]} oldArray
                 * @return {{removed: T[], added: T[]}}
                 */
                function arrayChanges(newArray, oldArray) {
                    newArray = angular.isDefined(newArray) ? newArray : [];
                    oldArray = angular.isDefined(oldArray) ? oldArray : [];
                    return {
                        added: newArray.filter(item => oldArray.indexOf(item) < 0),
                        removed: oldArray.filter(item => newArray.indexOf(item) < 0)
                    };
                }

                /**
                 * @param {import('../../anol/layer.js').default} layer
                 * @return {boolean}
                 */
                function isCatalogLayer(layer) {
                    return layer.catalog || layer.catalogLayer;
                }

                /**
                 * @param {import('../../anol/layer.js').default[]} layers
                 * @return {import('../../anol/layer.js').default[]}
                 */
                function permalinkLayers(layers) {
                    return layers
                        .filter(l => angular.isDefined(l.name) && !isCatalogLayer(l) && l.permalink !== false);
                }

                /**
                 * @param {import('../../anol/layer.js').default[]} layers
                 * @return {import('../../anol/layer.js').default[]}
                 */
                function catalogLayers(layers) {
                    return layers
                        .filter(l => isCatalogLayer(l));
                }

                /**
                 * @template T
                 * @param {T[]} array
                 * @param {T} elem
                 */
                function remove(array, elem) {
                    const idx = array.indexOf(elem);
                    if (idx > -1) {
                        array.splice(idx, 1);
                    }
                }

                /**
                 * @ngdoc service
                 * @name anol.permalink.PermalinkService
                 *
                 * @requires $rootScope
                 * @requires $location
                 * @requires anol.map.MapService
                 * @requires anol.map.LayersService
                 *
                 * @description
                 * Looks for a `map`-parameter in current url and move map to location specified in
                 *
                 * Updates browser-url with current zoom and location when map moved
                 */
                class Permalink {
                    /**
                     * @param {string} urlCrs
                     * @param {number} precision
                     */
                    constructor(urlCrs, precision) {
                        var self = this;
                        self.precision = precision;
                        self.zoom = undefined;
                        self.lon = undefined;
                        self.lat = undefined;
                        self.map = MapService.getMap();
                        self.view = self.map.getView();
                        /** @type {import('../../anol/layer.js').default[]} visibleLayers */
                        self.visibleLayers = [];
                        /** @type {import('../../anol/layer.js').default[]} catalogLayers */
                        self.catalogLayers = [];
                        /** @type {import('../../anol/layer/group.js').default[]} catalogGroups */
                        self.catalogGroups = [];

                        self.urlCrs = urlCrs;
                        if (angular.isUndefined(self.urlCrs)) {
                            var projection = self.view.getProjection();
                            self.urlCrs = projection.getCode();
                        }

                        self.map.on('moveend', function () {
                            self.moveendHandler();
                        }.bind(self));

                        this.asyncInitialize();
                    }

                    /**
                     * @private
                     */
                    async asyncInitialize() {
                        const self = this;

                        /**
                         * This will be called on layers from LayersService.flattedLayers().
                         * This contains all background and overlay layers including
                         * catalog layers but no groups.
                         * @param {import('../../anol/layer.js').default[]} layers
                         */
                        function addLayers(layers) {
                            for (const layer of permalinkLayers(layers)) {
                                layer.onVisibleChange(self.handleVisibleChange, self);
                                if (layer.getVisible()) {
                                    self.visibleLayers.push(layer);
                                }
                            }

                            for (const layer of catalogLayers(layers)) {
                                layer.onVisibleChange(self.handleVisibleChange, self);
                                self.catalogLayers.push(layer);
                                if (layer.getVisible()) {
                                    self.visibleLayers.push(layer);
                                }
                            }
                        }

                        /**
                         * @param {import('../../anol/layer.js').default[]} layers
                         */
                        function removeLayers(layers) {
                            for (const layer of permalinkLayers(layers)) {
                                layer.offVisibleChange(self.handleVisibleChange);
                                remove(self.visibleLayers, layer);
                            }

                            for (const layer of catalogLayers(layers)) {
                                layer.offVisibleChange(self.handleVisibleChange);
                                remove(self.catalogLayers, layer);
                                remove(self.visibleLayers, layer);
                            }
                        }


                        /**
                         * This will be called on layers from CatalogService.addedCatalogGroups().
                         * This contains all catalog layer groups.
                         * @param {import('../../anol/layer/group.js').default[]} groups
                         */
                        function addCatalogGroups(groups) {
                            for (const group of groups) {
                                group.onVisibleChange(self.handleVisibleChange, self);
                                self.catalogGroups.push(group);
                            }
                        }

                        /**
                         * @param {import('../../anol/layer/group.js').default[]} groups
                         */
                        function removeCatalogGroups(groups) {
                            for (const group of groups) {
                                group.offVisibleChange(self.handleVisibleChange);
                                remove(self.catalogGroups, group);
                            }
                        }

                        const mapParams = extractMapParams($location.search() || {});

                        await this.applyPermalinkParameters(mapParams);
                        await $timeout();

                        addLayers(LayersService.flattedLayers());
                        addCatalogGroups(CatalogService.addedCatalogGroups());
                        this.generatePermalink();

                        $rootScope.$watchCollection(
                            function () {
                                return LayersService.flattedLayers();
                            },
                            /**
                             * @param {import('../../anol/layer.js').default[]} newVal
                             * @param {import('../../anol/layer.js').default[]} oldVal
                             */
                            function (newVal, oldVal) {
                                const {added, removed} = arrayChanges(newVal, oldVal);

                                if (added.length > 0 || removed.length > 0) {
                                    addLayers(added);
                                    removeLayers(removed);
                                }

                                self.generatePermalink();
                            }
                        );

                        $rootScope.$watchCollection(
                            function () {
                                return CatalogService.addedCatalogGroups();
                            },
                            /**
                             * @param {import('../../anol/layer/group.js').default[]} newVal
                             * @param {import('../../anol/layer/group.js').default[]} oldVal
                             */
                            function (newVal, oldVal) {
                                const {added, removed} = arrayChanges(newVal, oldVal);

                                if (added.length > 0 || removed.length > 0) {
                                    addCatalogGroups(added);
                                    removeCatalogGroups(removed);
                                }

                                self.generatePermalink();
                            }
                        );

                        $rootScope.$watch('sidebar.open', () => self.generatePermalink());
                        $rootScope.$watch('sidebar.openItems', () => self.generatePermalink());
                    }

                    /**
                     * Handler for the visibility change event.
                     *
                     * This method will be called when the visibility of a layer or a group changes.
                     * The visibility change of a group also triggers the visibility change of all
                     * included layers explicitly. So groups should be ignored in this method.
                     * However, changing the visibility of a group that only contains a single layer
                     * does not trigger the change event on the single layer (groups with single
                     * layers will be displayed as single layers instead of groups). So in this case
                     * we have to set the visibility of the layer on the change event of the group.
                     *
                     * @private
                     * @param {any} evt
                     * @this {import('../../anol/layer.js').default}
                     */
                    handleVisibleChange(evt) {
                        const self = evt.data.context;
                        // this in this context is the layer, visible changed for
                        const layer = this;
                        let layerName = layer.name;

                        if (layer.permalink !== false) {
                            if (angular.isDefined(layerName) && layer.getVisible()) {
                                if (self.visibleLayers.length === 1 && self.visibleLayers[0].name === '') {
                                    self.visibleLayers.splice(0, 1);
                                }
                                self.visibleLayers.push(layer);
                            } else {
                                remove(self.visibleLayers, layer);
                            }
                        }

                        const isSingleLayerGroup = layer.anolGroup?.layers.length === 1;
                        const isLayerGroup = isSingleLayerGroup || layer instanceof Group;

                        if (layer.catalogLayer === true) {

                          // Ignore layergroups except those with only one layer.
                          if (!isLayerGroup) {
                              if (angular.isDefined(layerName) && layer.getVisible()) {
                                  self.visibleLayers.push(layer);
                              } else {
                                  remove(self.visibleLayers, layer);
                              }
                          } else if (isSingleLayerGroup) {
                              const singleLayer = layer.anolGroup?.layers[0];
                              const singleLayerName = singleLayer.name;
                              if (angular.isDefined(singleLayerName) && singleLayer.getVisible()) {
                                  self.visibleLayers.push(singleLayer);
                              } else {
                                  remove(self.visibleLayers, singleLayer);
                              }
                          }

                        }

                        self.generatePermalink();
                    }

                    /**
                     * @private
                     * @name moveendHandler
                     * @methodOf anol.permalink.PermalinkService
                     * @description
                     * Get lat, lon and zoom after map stoped moving
                     */
                    moveendHandler() {
                        var self = this;
                        var center = transform(self.view.getCenter(), self.view.getProjection().getCode(), self.urlCrs);
                        self.lon = Math.round(center[0] * self.precision) / self.precision;
                        self.lat = Math.round(center[1] * self.precision) / self.precision;

                        self.zoom = self.view.getZoom();
                        $rootScope.$apply(function () {
                            self.generatePermalink();
                        });
                    }

                    /**
                     * @private
                     * @name generatePermalink
                     * @methodOf anol.permalink.PermalinkService
                     * @description
                     * Builds the permalink url addon
                     */
                    generatePermalink() {
                        const parameters = this.getParameters();

                        if (angular.isUndefined(parameters.zoom) || angular.isUndefined(parameters.center)) {
                            return;
                        }

                        $location.search('map', [parameters.zoom, parameters.center[0], parameters.center[1], parameters.crs].join(','));

                        $location.search('layers', parameters.layers.join(','));

                        $location.search('visibleCatalogLayers', null);
                        $location.search('visibleCatalogGroups', null);

                        if (angular.isDefined(parameters.catalogLayers) && parameters.catalogLayers.length > 0) {
                            $location.search('catalogLayers', parameters.catalogLayers
                                .join(','));
                        } else {
                            $location.search('catalogLayers', null);
                        }

                        if (angular.isDefined(parameters.catalogGroups) && parameters.catalogGroups.length > 0) {
                            $location.search('catalogGroups', parameters.catalogGroups
                                .join(','));
                        } else {
                            $location.search('catalogGroups', null);
                        }

                        $location.search('fit', null);

                        $location.search('groupOrder', parameters.groupOrder.join(','));

                        $location.search('sidebarStatus', parameters.sidebarStatus);

                        if (angular.isDefined(parameters.sidebar) && parameters.sidebar.length > 0) {
                            $location.search('sidebar', parameters.sidebar.join(','))
                        }

                        $location.replace();
                    }

                    /**
                     * Apply params from url to application.
                     * @param {Partial<PermalinkParameters>} mapParams
                     * @return {Promise<void[]>}
                     */
                    applyPermalinkParameters(mapParams) {
                        var self = this;
                        if (mapParams.center !== undefined && mapParams.crs !== undefined) {
                            var center = transform(mapParams.center, mapParams.crs, self.view.getProjection().getCode());
                            self.view.setCenter(center);
                            self.view.setZoom(mapParams.zoom);
                        }

                        if (mapParams.layers !== undefined) {
                            for (const layer of permalinkLayers(LayersService.flattedLayers())) {
                                const visible = mapParams.layers.includes(layer.name);
                                layer.setVisible(visible);
                            }
                        }

                        if (mapParams.fit !== undefined) {
                            var extent = transformExtent(
                                /** @type {import('ol/extent').Extent} */ (mapParams.fit.extent),
                                mapParams.fit.crs,
                                self.view.getProjection().getCode());
                            this.map.once('postrender', function () {
                                self.view.fit(extent);
                            });
                        }

                        return Promise.all([
                            this.applyCatalogParameters(mapParams),
                            this.applyGeocodeParameters(mapParams),
                            this.applySidebarParameters(mapParams)
                        ]);
                    }

                    /**
                     * @param {Partial<PermalinkParameters>} mapParams
                     * @return {Promise<void>}
                     */
                    async applySidebarParameters(mapParams) {
                        await new Promise(resolve => {
                            if ($rootScope.appReady) {
                                resolve(true);
                            }
                            $rootScope.$watch('appReady', function () {
                                if ($rootScope.appReady) {
                                    resolve(true);
                                }
                            })
                        });

                        if (angular.isDefined(mapParams.sidebar)) {
                            $rootScope.sidebar.openItems = mapParams.sidebar;
                        }

                        if (angular.isDefined(mapParams.sidebarStatus)) {
                            $rootScope.sidebar.open = mapParams.sidebarStatus === 'open';
                        }
                    }

                    /**
                     * Apply catalog params from url to application
                     * @param {Partial<PermalinkParameters>} mapParams
                     * @return {Promise<void>}
                     */
                    async applyCatalogParameters(mapParams) {
                        if (mapParams.catalogGroups !== undefined) {
                            const groups = (await Promise.all(
                              mapParams.catalogGroups
                                .map(groupName => CatalogService.addGroupToMap(groupName, false))
                            ))
                            .filter(g => g);

                            let layers = (mapParams.layers ?? []).concat(mapParams.visibleCatalogLayers ?? []);

                            const visibleCatalogGroups = mapParams.visibleCatalogGroups ?? [];

                            const allAvailable = angular.isUndefined(mapParams.catalogLayers) || mapParams.catalogLayers?.length === 0;

                            const available = allAvailable ? [] : angular.extend(mapParams.catalogLayers);

                            let toRemove = [];

                            for (const group of groups) {
                                for (const layer of group.layers) {
                                    if (allAvailable || available.indexOf(layer.name) > -1) {
                                        if (layers) {
                                            const visible = layers.indexOf(layer.name) > -1;
                                            layer.setVisible(visible);
                                        }
                                        if (!allAvailable) {
                                            available.splice(available.indexOf(layer.name), 1);
                                        }
                                    } else {
                                        toRemove.push(layer);
                                    }
                                }

                                if (visibleCatalogGroups.includes(group.name)) {
                                    group.setVisible(true);
                                }
                            }

                            for (const layerName of available) {
                                const visible = mapParams.layers &&
                                    mapParams.layers.indexOf(layerName) > -1;
                                CatalogService.addToMap(layerName, visible);
                            }

                            await $timeout();

                            for (const layer of toRemove) {
                                CatalogService.removeFromMap(layer);
                            }
                        }

                        // layer order

                        if (mapParams.groupOrder !== undefined) {
                            LayersService.setLayerOrder(mapParams.groupOrder.map(n => ({ name: n })));
                            $rootScope.$digest();
                        }
                    }

                    /**
                     * @param {Partial<PermalinkParameters>} mapParams
                     * @return {Promise<void>}
                     */
                    async applyGeocodeParameters(mapParams) {
                        if (mapParams.geocode !== undefined) {
                            const {config, term, highlight, label} = mapParams.geocode;
                            let parsedHighlight = angular.isUndefined(highlight) ? false : JSON.parse(highlight);
                            ReadyService.waitFor('geocoding');
                            await GeocoderService.handleUrlGeocode(term, config, parsedHighlight, label)
                            ReadyService.notifyAboutReady('geocoding');
                            $location.search('geocode', null);
                        }
                    }

                    /**
                     * @return {PermalinkParameters}
                     */
                    getParameters() {
                        const sidebarStatus = $rootScope.sidebar.open ? 'open' : 'closed';
                        const sidebar = $rootScope.sidebar.openItems;
                        const groupOrder = /** @type {import('../../anol/layer.js').default[]} */ (LayersService.overlayLayers)
                            .map(l => l.name)
                            .filter(l => l);

                        return {
                            zoom: this.zoom,
                            center: [this.lon ?? 0, this.lat ?? 0],
                            crs: this.urlCrs,
                            layers: this.visibleLayers.map(l => l.name),
                            catalogLayers: this.catalogLayers.map(l => l.name),
                            catalogGroups: this.catalogGroups.map(l => l.name),
                            groupOrder: groupOrder,
                            sidebar: sidebar,
                            sidebarStatus: sidebarStatus
                        };
                    }

                    getPermalinkParameters() {
                        return {
                            zoom: this.zoom,
                            center: [this.lon, this.lat],
                            crs: this.urlCrs,
                            layers: this.visibleLayers.map(l => l.name)
                        };
                    }
                }

                return new Permalink(_urlCrs, _precision);
            }];
    }]);
