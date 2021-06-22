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
            if (layersParam !== false) {
                layers = layersParam.split(',');
            }

            var defaultOverlaysParam = getParamString('defaultOverlays', params);
            var defaultOverlays;
            if (defaultOverlaysParam !== false) {
                defaultOverlays = defaultOverlaysParam.split(',');
            }

            var backgroundLayerParam = getParamString('backgroundLayer', params);
            var backgroundLayer;
            if (backgroundLayerParam !== false) {
                backgroundLayer = backgroundLayerParam;
            }

            var visibleCatalogLayersParam = getParamString('visibleCatalogLayers', params);
            var visibleCatalogLayers;
            if (visibleCatalogLayersParam !== false) {
                visibleCatalogLayers = visibleCatalogLayersParam.split(',');
            }

            var catalogLayersParam = getParamString('catalogLayers', params);
            var catalogLayers;
            if (catalogLayersParam !== false) {
                catalogLayers = catalogLayersParam.split(',');
            }

            var visibleCatalogGroupsParam = getParamString('visibleCatalogGroups', params);
            var visibleCatalogGroups;
            if (visibleCatalogGroupsParam !== false) {
                visibleCatalogGroups = visibleCatalogGroupsParam.split(',');
            }

            var catalogGroupsParam = getParamString('catalogGroups', params);
            var catalogGroups;
            if (catalogGroupsParam !== false) {
                catalogGroups = catalogGroupsParam.split(',');
            }

            var fitParam = getParamString('fit', params);
            var fitParams;
            if (fitParam !== false) {
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

            if (angular.isDefined(defaultOverlays)) {
                result.defaultOverlays = defaultOverlays;
            }

            if (angular.isDefined(backgroundLayer)) {
                result.backgroundLayer = backgroundLayer;
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

                function permalinkLayers(layers) {
                    return layers
                        .filter(l => angular.isDefined(l) && angular.isDefined(l.name))
                        .flatMap(l => l instanceof anol.layer.Group ? l.layers : [l])
                        .filter(l => l.permalink === true);
                }

                function backgroundLayers(layers) {
                    return layers
                        .filter(l => angular.isDefined(l) && l.isBackground);
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
                    self.visibleGroups = [];
                    self.visibleDefaultOverlays = [];
                    self.backgroundLayer = [];
                    self.visibleCatalogLayers = [];
                    self.catalogLayers = [];
                    self.visibleCatalogGroups = [];
                    self.catalogGroups = [];

                    self.urlCrs = urlCrs;
                    if (angular.isUndefined(self.urlCrs)) {
                        var projection = self.view.getProjection();
                        self.urlCrs = projection.getCode();
                    }

                    var params = $location.search();

                    var mapParams = extractMapParams(params);
                    if (mapParams !== false) {
                        self.updateMapFromParameters(mapParams);
                    } else {
                        angular.forEach(LayersService.flattedLayers(), function (layer) {
                            if (layer.permalink === true) {
                                if (layer.getVisible()) {
                                    self.visibleLayers.push(layer);
                                    if (layer.anolGroup) {
                                        self.visibleGroups.push(layer.anolGroup)
                                    }
                                }
                            }
                            if (layer.isBackground && layer.getVisible()) {
                                self.backgroundLayer = layer;
                            }
                        });
                    }
                    self.map.on('moveend', function () {
                        self.moveendHandler();
                    }.bind(self));

                    for (const layer of LayersService.flattedLayers()) {
                        if (layer.isBackground || layer.permalink) {
                            layer.onVisibleChange(self.handleVisibleChange, self);
                        }
                    }

                    $rootScope.$watchCollection(function () {
                        return LayersService.layers();
                    }, function (newVal, oldVal) {
                        const {added, removed} = arrayChanges(newVal, oldVal);

                        if (added.length + removed.length === 0) {
                            return;
                        }

                        self.visibleLayers = [];

                        for (const layer of permalinkLayers(added)) {
                            layer.onVisibleChange(self.handleVisibleChange, self);
                            if (layer.getVisible()) {
                                self.visibleLayers.push(layer);
                            }
                        }

                        for (const layer of permalinkLayers(removed)) {
                            layer.offVisibleChange(self.handleVisibleChange);
                        }

                        for (const bgLayer of backgroundLayers(added)) {
                            layer.onVisibleChange(self.handleVisibleChange, self);
                        }

                        for (const bgLayer of backgroundLayers(removed)) {
                            layer.offVisibleChange(self.handleVisibleChange);
                        }

                        self.generatePermalink();
                    });

                    $rootScope.$watchCollection(function () {
                        return CatalogService.addedCatalogGroups();
                    }, function (newVal, oldVal) {
                        const {added, removed} = arrayChanges(newVal, oldVal);

                        if (added.length + removed.length === 0) {
                            return;
                        }

                        self.catalogGroups = [];
                        self.visibleCatalogGroups = [];
                        self.visibleCatalogLayers = [];

                        for (const group of added) {
                            group.onVisibleChange(self.handleVisibleChange, self);
                            for (const layer of group.layers) {
                                layer.onVisibleChange(self.handleVisibleChange, self);
                                if (layer.getVisible()) {
                                    self.visibleCatalogLayers.push(layer);
                                }
                            }

                            self.catalogGroups.push(group);
                            if (group.getVisible()) {
                                self.visibleCatalogGroups.push(group);
                            }
                        }

                        for (const group of removed) {
                            group.offVisibleChange(self.handleVisibleChange);
                            for (const layer of group.layers) {
                                layer.offVisibleChange(self.handleVisibleChange);
                            }
                        }

                        self.generatePermalink();
                    });

                    $rootScope.$watchCollection(function () {
                        return CatalogService.addedCatalogLayers();
                    }, function (newVal, oldVal) {
                        const {added, removed} = arrayChanges(newVal, oldVal);

                        if (added.length + removed.length === 0) {
                            return;
                        }

                        self.catalogLayers = [];
                        self.visibleCatalogLayers = [];

                        for (const layer of added) {
                            layer.onVisibleChange(self.handleVisibleChange);
                            self.catalogLayers.push(layer);
                            if (layer.getVisible()) {
                                self.visibleCatalogLayers.push(layer);
                            }
                        }

                        for (const layer of removed) {
                            layer.offVisibleChange(self.handleVisibleChange);
                        }

                        self.generatePermalink();
                    });
                };

                /**
                 * @private
                 */
                Permalink.prototype.handleVisibleChange = function (evt) {
                    var self = evt.data.context;
                    // this in this context is the layer, visible changed for
                    var layer = this;
                    var layerName = layer.name;
                    var layerGroup = layer.anolGroup;

                    if (!layer.isBackground && layer.permalink === true) {
                        if (angular.isDefined(layerName) && layer.getVisible()) {
                            if (self.visibleLayers.length === 1 && self.visibleLayers[0].name === '') {
                                console.warn('why?') // TODO: remove
                                self.visibleLayers.splice(0, 1);
                            }
                            if (layerGroup) {
                                self.visibleGroups.push(layerGroup);
                            }
                            self.visibleLayers.push(layerName);
                        } else {
                            var layerIdx = self.visibleLayers.indexOf(layer);
                            // remove the layer from the sortedByGroup array
                            if (layerIdx > -1) {
                                self.visibleLayers.splice(layerIdx, 1);
                            }
                        }
                    }

                    if (layer.isBackground) {
                        if (angular.isDefined(layer.name) && layer.getVisible()) {
                            self.backgroundLayer = layer
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
                                var layerIdx = self.visibleCatalogGroups.indexOf(layer);
                                if (layerIdx > -1) {
                                    self.visibleCatalogGroups.splice(layerIdx, 1);
                                }
                            }
                        } else {
                            if (angular.isDefined(layerName) && layer.getVisible()) {
                                self.visibleCatalogLayers.push(layer);
                            } else {
                                var layerIdx = self.visibleCatalogLayers.indexOf(layer);
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

                Permalink.prototype.sortedLayerNames = function () {
                    return this.visibleLayers.sort(function (a, b) {
                        if (a.anolGroup.name < b.anolGroup.name) {
                            return -1
                        }
                        if (a.anolGroup.name > b.anolGroup.name) {
                            return 1
                        }
                        return 0;
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

                    if (self.backgroundLayer.length !== 0) {
                        $location.search('backgroundLayer', self.backgroundLayer.name);

                    } else {
                        $location.search('backgroundLayer', '');
                    }

                    if (self.visibleDefaultOverlays.length !== 0) {
                        $location.search('defaultOverlays', self.visibleDefaultOverlays
                            .map(layer => layer.name)
                            .join(','));
                    } else {
                        $location.search('defaultOverlays', null);
                    }

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

                    if (mapParams.defaultOverlays !== undefined) {
                        self.visibleDefaultOverlays = [];
                        for (const layer of LayersService.overlayLayers) {
                            // find in the layers the overlay layers that are defined
                            var visible = mapParams.defaultOverlays.indexOf(layer.name) !== -1;
                            // if found then set its visibility to true
                            layer.setVisible(visible);
                            if (visible) {
                                self.visibleDefaultOverlays.push(layer);
                            }
                        }
                    }

                    if (angular.isDefined(mapParams.backgroundLayer)) {
                        self.backgroundLayer = LayersService.backgroundLayers
                            .find(l => l.getVisible());

                        setTimeout(() => {
                            for (const layer of LayersService.backgroundLayers) {
                                layer.setVisible(layer.name === mapParams.backgroundLayer)
                            }
                        }, 0)
                    } else {
                        self.backgroundLayer = LayersService.backgroundLayers
                            .find(l => l.getVisible());
                    }

                    if (mapParams.layers !== undefined) {
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

                    if (angular.isDefined(self.deferred)) {
                        if (catalogGroupPromises.length !== 0) {
                            $q.all(catalogGroupPromises).then(function () {
                                self.deferred.resolve();
                            });
                        } else {
                            self.deferred.resolve();
                        }
                    }
                };

                Permalink.prototype.getParameters = function () {
                    var sidebarStatus = $location.search().sidebarStatus;
                    var sidebar = $location.search().sidebar;

                    return {
                        zoom: this.zoom,
                        center: [this.lon, this.lat],
                        crs: this.urlCrs,
                        layers: this.sortedLayerNames(),
                        defaultOverlays: this.visibleDefaultOverlays.map(l => l.name),
                        backgroundLayer: this.backgroundLayer.name,
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
                        layers: this.sortedLayerNames(),
                        defaultOverlays: this.defaultOverlays.map(l => l.name),
                        backgroundLayer: this.backgroundLayer.name
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
