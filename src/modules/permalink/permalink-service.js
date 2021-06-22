import './module.js';
import {transform, transformExtent} from 'ol/proj';

angular.module('anol.permalink')

    /**
     * @ngdoc object
     * @name anol.permalink.PermalinkServiceProvider
     */
    .provider('PermalinkService', [function () {
        var _urlCrs;
        var _precision = 100000;

        /**
         * @param {string} param
         * @param {string[]} params
         * @return {boolean|string}
         */
        var getParamString = function (param, params) {
            if (angular.isUndefined(params[param])) {
                return false;
            }
            var p = params[param];
            if (angular.isArray(p)) {
                p = p[p.length - 1];
            }
            return p;
        };

        var extractMapParams = function (params) {
            var mapParam = getParamString('map', params);
            var mapParams;
            if (mapParam !== false) {
                mapParams = mapParam.split(',');
            }

            var layersParam = getParamString('layers', params);
            var layers;
            if (layersParam !== false && layersParam !== '') {
                layers = layersParam.split(',');
            }

            var visibleCatalogLayersParam = getParamString('visibleCatalogLayers', params);
            var visibleCatalogLayers;
            if (visibleCatalogLayersParam !== false && visibleCatalogLayersParam !== '') {
                visibleCatalogLayers = visibleCatalogLayersParam.split(',');
            }

            var catalogLayersParam = getParamString('catalogLayers', params);
            var catalogLayers;
            if (catalogLayersParam !== false && catalogLayersParam !== '') {
                catalogLayers = catalogLayersParam.split(',');
            }

            var visibleCatalogGroupsParam = getParamString('visibleCatalogGroups', params);
            var visibleCatalogGroups;
            if (visibleCatalogGroupsParam !== false && visibleCatalogGroupsParam !== '') {
                visibleCatalogGroups = visibleCatalogGroupsParam.split(',');
            }

            var catalogGroupsParam = getParamString('catalogGroups', params);
            var catalogGroups;
            if (catalogGroupsParam !== false && catalogGroupsParam !== '') {
                catalogGroups = catalogGroupsParam.split(',');
            }

            var fitParam = getParamString('fit', params);
            var fitParams;
            if (fitParam !== false && fitParam !== '') {
                fitParams = fitParam.split(',');
            }

            var result = {}
            if (angular.isDefined(mapParams)) {
                if (mapParams.length === 4) {
                    result = {
                        'zoom': parseInt(mapParams[0]),
                        'center': [parseFloat(mapParams[1]), parseFloat(mapParams[2])],
                        'crs': mapParams[3]
                    };
                } else {
                    console.error('Url param `map` has incorrect number of arguments. ' +
                        'Expected: `map={zoom},{centerX},{centerY},{crs}`');
                }
            }

            if (angular.isDefined(layers)) {
                result.layers = layers;
            }

            if (angular.isDefined(catalogLayers)) {
                result.catalogLayers = catalogLayers;
            }

            if (angular.isDefined(visibleCatalogLayers)) {
                result.visibleCatalogLayers = visibleCatalogLayers;
            }

            if (angular.isDefined(catalogGroups)) {
                result.catalogGroups = catalogGroups;
            }

            if (angular.isDefined(visibleCatalogGroups)) {
                result.visibleCatalogGroups = visibleCatalogGroups;
            }

            if (angular.isDefined(fitParams)) {
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

        this.$get = ['$rootScope', '$q', '$location', 'MapService', 'LayersService', 'CatalogService',
            function ($rootScope, $q, $location, MapService, LayersService, CatalogService) {

                function arrayChanges(newArray, oldArray) {
                    newArray = angular.isDefined(newArray) ? newArray : [];
                    oldArray = angular.isDefined(oldArray) ? oldArray : [];
                    return {
                        added: newArray.filter(item => oldArray.indexOf(item) < 0),
                        removed: oldArray.filter(item => newArray.indexOf(item) < 0)
                    };
                }

                function isCatalogLayer(layer) {
                    return layer.catalog || layer.catalogLayer;
                }

                function permalinkLayers(layers) {
                    return layers
                        .filter(l => angular.isDefined(l.name) && !isCatalogLayer(l) && l.permalink !== false);
                }

                function catalogLayers(layers) {
                    return layers
                        .filter(l => isCatalogLayer(l));
                }

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
                var Permalink = function (urlCrs, precision) {
                    var self = this;
                    self.precision = precision;
                    self.zoom = undefined;
                    self.lon = undefined;
                    self.lat = undefined;
                    self.deferred = undefined;
                    self.map = MapService.getMap();
                    self.view = self.map.getView();
                    self.visibleLayers = [];
                    self.visibleCatalogLayers = [];
                    self.catalogLayers = [];
                    self.visibleCatalogGroups = [];
                    self.catalogGroups = [];

                    self.urlCrs = urlCrs;
                    if (angular.isUndefined(self.urlCrs)) {
                        var projection = self.view.getProjection();
                        self.urlCrs = projection.getCode();
                    }

                    self.map.on('moveend', function () {
                        self.moveendHandler();
                    }.bind(self));

                    // This will be called on layers from LayersService.flattedLayers().
                    // This contains all background and overlay layers including
                    // catalog layers but no groups.
                    function addLayers(layers) {
                        for (const layer of permalinkLayers(layers)) {
                            layer.onVisibleChange(self.handleVisibleChange, self);
                            if (layer.getVisible()) {
                                self.visibleLayers.push(layer);
                            }
                        }

                        for (const layer of catalogLayers(layers)) {
                            layer.onVisibleChange(self.handleVisibleChange);
                            if (angular.isUndefined(layer.anolGroup)) {
                                // if the layer has a group it as included via the group
                                self.catalogLayers.push(layer);
                            }
                            if (layer.getVisible()) {
                                self.visibleCatalogLayers.push(layer);
                            }
                        }
                    }

                    function removeLayers(layers) {
                        for (const layer of permalinkLayers(layers)) {
                            layer.offVisibleChange(self.handleVisibleChange);
                            remove(self.visibleLayers, layer);
                        }

                        for (const layer of catalogLayers(layers)) {
                            layer.offVisibleChange(self.handleVisibleChange);
                            remove(self.catalogLayers, layer);
                            remove(self.visibleCatalogLayers, layer);
                        }
                    }

                    // This will be called on layers from CatalogService.addedCatalogGroups().
                    // This contains all catalog layer groups.
                    function addCatalogGroups(groups) {
                        for (const group of groups) {
                            group.onVisibleChange(self.handleVisibleChange, self);
                            self.catalogGroups.push(group);
                            if (group.getVisible()) {
                                self.visibleCatalogGroups.push(group);
                            }
                        }
                    }

                    function removeCatalogGroups(groups) {
                        for (const group of groups) {
                            group.offVisibleChange(self.handleVisibleChange);
                            remove(self.catalogGroups, group);
                            remove(self.visibleCatalogGroups, group);
                        }
                    }

                    var params = $location.search();

                    self.updateMapFromParameters(extractMapParams(params) || {})
                        .then(() => {
                            setTimeout(() => {
                                addLayers(LayersService.flattedLayers());
                                addCatalogGroups(CatalogService.addedCatalogGroups());
                                self.generatePermalink();
                            }, 0);


                            $rootScope.$watchCollection(function () {
                                return LayersService.flattedLayers();
                            }, function (newVal, oldVal) {
                                const {added, removed} = arrayChanges(newVal, oldVal);

                                if (added.length + removed.length === 0) {
                                    return;
                                }

                                addLayers(added);
                                removeLayers(removed);
                                self.generatePermalink();
                            });

                            $rootScope.$watchCollection(function () {
                                return CatalogService.addedCatalogGroups();
                            }, function (newVal, oldVal) {
                                const {added, removed} = arrayChanges(newVal, oldVal);

                                if (added.length + removed.length === 0) {
                                    return;
                                }

                                addCatalogGroups(added);
                                removeCatalogGroups(removed);
                                self.generatePermalink();
                            });
                        });
                };

                /**
                 * @private
                 */
                Permalink.prototype.handleVisibleChange = function (evt) {
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
                            const layerIdx = self.visibleLayers.indexOf(layer);
                            // remove the layer from the sortedByGroup array
                            if (layerIdx > -1) {
                                self.visibleLayers.splice(layerIdx, 1);
                            }
                        }
                    }

                    if (layer.catalogLayer === true) {
                        if (layer instanceof anol.layer.Group || (layer.hasGroup() && layer.anolGroup.layers.length == 1)) {
                            if (typeof layer.hasGroup == 'function' && layer.hasGroup()) {
                                layerName = layer.anolGroup.name;
                            }

                            if (angular.isDefined(layerName) && layer.getVisible()) {
                                self.visibleCatalogGroups.push(layer);
                            } else {
                                const layerIdx = self.visibleCatalogGroups.indexOf(layer);
                                if (layerIdx > -1) {
                                    self.visibleCatalogGroups.splice(layerIdx, 1);
                                }
                            }
                        } else {
                            if (angular.isDefined(layerName) && layer.getVisible()) {
                                self.visibleCatalogLayers.push(layer);
                            } else {
                                const layerIdx = self.visibleCatalogLayers.indexOf(layer);
                                if (layerIdx > -1) {
                                    self.visibleCatalogLayers.splice(layerIdx, 1);
                                }
                            }
                        }
                    }
                    self.generatePermalink();
                };
                /**
                 * @private
                 * @name moveendHandler
                 * @methodOf anol.permalink.PermalinkService
                 * @param {Object} evt ol3 event object
                 * @description
                 * Get lat, lon and zoom after map stoped moving
                 */
                Permalink.prototype.moveendHandler = function () {
                    var self = this;
                    var center = transform(self.view.getCenter(), self.view.getProjection().getCode(), self.urlCrs);
                    self.lon = Math.round(center[0] * self.precision) / self.precision;
                    self.lat = Math.round(center[1] * self.precision) / self.precision;

                    self.zoom = self.view.getZoom();
                    $rootScope.$apply(function () {
                        self.generatePermalink();
                    });
                };

                /**
                 * Sorts layers by group and returns name.
                 * @return {sting[]}
                 */
                Permalink.prototype.sortedLayerNames = function () {
                    return this.visibleLayers.sort(function (a, b) {
                        if (angular.isDefined(a.anolGroup)) {
                            if (angular.isDefined(b.anolGroup)) {
                                return a.anolGroup.name.localeCompare(b.anolGroup.name, 'de');
                            } else {
                                return 1;
                            }
                        } else {
                            if (angular.isDefined(b.anolGroup)) {
                                return -1;
                            } else {
                                return 0;
                            }
                        }
                    }).map(layer => layer.name);
                };

                /**
                 * @private
                 * @name generatePermalink
                 * @methodOf anol.permalink.PermalinkService
                 * @param {Object} evt ol3 event object
                 * @description
                 * Builds the permalink url addon
                 */
                Permalink.prototype.generatePermalink = function () {
                    var self = this;
                    if (angular.isUndefined(self.zoom) || angular.isUndefined(self.lon) || angular.isUndefined(self.lat)) {
                        return;
                    }

                    $location.search('map', [self.zoom, self.lon, self.lat, self.urlCrs].join(','));

                    $location.search('layers', this.sortedLayerNames().join(','));

                    if (self.visibleCatalogLayers.length !== 0) {
                        $location.search('visibleCatalogLayers', self.visibleCatalogLayers
                            .map(layer => layer.name)
                            .join(','));
                    } else {
                        $location.search('visibleCatalogLayers', null);
                    }

                    if (self.catalogLayers.length !== 0) {
                        $location.search('catalogLayers', self.catalogLayers
                            .map(layer => layer.name)
                            .join(','));
                    } else {
                        $location.search('catalogLayers', null);
                    }

                    if (self.visibleCatalogGroups.length !== 0) {
                        $location.search('visibleCatalogGroups', self.visibleCatalogGroups
                            .map(layer => layer.name)
                            .join(','));
                    } else {
                        $location.search('visibleCatalogGroups', null);
                    }

                    if (self.catalogGroups.length !== 0) {
                        $location.search('catalogGroups', self.catalogGroups
                            .map(layer => layer.name)
                            .join(','));
                    } else {
                        $location.search('catalogGroups', null);
                    }

                    $location.search('fit', null);

                    $location.replace();
                };

                Permalink.prototype.updateMapFromParameters = function (mapParams) {
                    var self = this;
                    if (mapParams.center !== undefined) {
                        var center = transform(mapParams.center, mapParams.crs, self.view.getProjection().getCode());
                        self.view.setCenter(center);
                        self.view.setZoom(mapParams.zoom);
                    }

                    if (angular.isDefined(mapParams.layers)) {
                        for (const layer of permalinkLayers(LayersService.layers())) {
                            const visible = mapParams.layers.indexOf(layer.name) !== -1;
                            layer.setVisible(visible);
                        }
                    }

                    if (mapParams.catalogLayers !== undefined) {
                        for (const layerName of mapParams.catalogLayers) {
                            const visible = mapParams.visibleCatalogLayers &&
                                mapParams.visibleCatalogLayers.indexOf(layerName) > -1;
                            CatalogService.addToMap(layerName, visible);
                        }
                    }

                    var catalogGroupPromises = [];
                    if (mapParams.catalogGroups !== undefined) {
                        for (const groupName of mapParams.catalogGroups) {
                            const visible = mapParams.visibleCatalogGroups &&
                                mapParams.visibleCatalogGroups.indexOf(groupName) > -1;
                            var group = CatalogService.addGroupToMap(groupName, visible);
                            if (group) {
                                catalogGroupPromises.push(group);
                                group.then(function (group) {
                                    if (group.layers.length > 1) {
                                        for (const layer of group.layers) {
                                            if (mapParams.visibleCatalogLayers) {
                                                const visible = mapParams.visibleCatalogLayers.indexOf(layer.name) > -1;
                                                layer.setVisible(visible);
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    }

                    if (mapParams.fit !== undefined) {
                        var extent = transformExtent(mapParams.fit.extent, mapParams.fit.crs, self.view.getProjection().getCode());
                        this.map.once('postrender', function () {
                            self.view.fit(extent);
                        });
                    }

                    return $q.all(catalogGroupPromises).then(function () {
                        if (angular.isDefined(self.deferred)) {
                            self.deferred.resolve();
                        }
                    });
                };

                Permalink.prototype.getParameters = function () {
                    var sidebarStatus = $location.search().sidebarStatus;
                    var sidebar = $location.search().sidebar;

                    return {
                        zoom: this.zoom,
                        center: [this.lon, this.lat],
                        crs: this.urlCrs,
                        layers: this.sortedLayerNames(),
                        catalogLayers: this.catalogLayers.map(l => l.name),
                        visibleCatalogLayers: this.visibleCatalogLayers.map(l => l.name),
                        catalogGroups: this.catalogGroups.map(l => l.name),
                        visibleCatalogGroups: this.visibleCatalogGroups.map(l => l.name),
                        sidebar: sidebar,
                        sidebarStatus: sidebarStatus
                    };
                };

                Permalink.prototype.getPermalinkParameters = function () {
                    return {
                        zoom: this.zoom,
                        center: [this.lon, this.lat],
                        crs: this.urlCrs,
                        layers: this.sortedLayerNames()
                    };
                };

                Permalink.prototype.setPermalinkParameters = function (params) {
                    var self = this;
                    self.deferred = $q.defer();
                    self.updateMapFromParameters(params);
                    return self.deferred.promise;
                };

                return new Permalink(_urlCrs, _precision);
            }];
    }]);
