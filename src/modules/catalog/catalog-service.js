import './module.js';
import voca from 'voca';

angular.module('anol.catalog')

/**
 * @ngdoc object
 * @name anol.catalog.CatalogServiceProvider
 */
.provider('CatalogService', [function() {
    var _loadUrl  = undefined;

    this.setLoadUrl = function(url) {
        _loadUrl = url;
    };

    this.$get = ['$q', '$http', '$rootScope', 'LayersService', function($q, $http, $rootScope, LayersService) {
        /**
         * @ngdoc service
         * @name anol.catalog.CatalogService
         *
         * @description
         * Handles current catalog layer
         */
        var CatalogService = function(loadUrl) {
            var self = this;
            this.catalogGroups = [];
            this.addedLayers = [];
            this.addedLayersName = [];
            this.addedGroups = [];
            this.addedGroupsName = [];
            this.nameGroupsMap = {};
            this.sortedLayers = {};
            this.sortedGroups = {};
            this.firstLetters = [];
            this.firstLettersGroups = [];
            this.addedGroupsLength = 0;
            this.variant = undefined;
            this.loadUrl = loadUrl;
            this.catalogLayerNames = [];
            this.catalogGroupNames = [];

            var pageBody = angular.element(document).find('body');
            this.addWaiting = function() {
                pageBody.addClass('waiting');
            }
            this.removeWaiting = function() {
                pageBody.removeClass('waiting');
            }
            if (angular.isUndefined(this.loadUrl)) {
                return;
            }
            this.deferred = $q.defer();

            $http.get(loadUrl).then(
                function(response) {
                    if(response.data.layers) {
                        self.catalogLayerNames = response.data.layers;
                       self.createLayerCatalog();
                    }
                    if(response.data.groups) {
                        self.catalogGroupNames = response.data.groups;
                        self.createGroupCatalog();
                    }
            })

            self.createLayerCatalog = function() {
                var self = this;
                var sortedLayers = {};
                angular.forEach(self.catalogLayerNames, function(_layer) {
                    self.addCatalogLayer(_layer);

                    var firstLetter = _layer.title.charAt(0).toUpperCase();
                    if (self.firstLetters.indexOf(firstLetter) === -1) {
                        if (!_layer.visible) {
                            return;
                        }
                        self.firstLetters.push(firstLetter);
                        sortedLayers[firstLetter] = {
                            'layers':  [_layer],
                            'title': firstLetter,
                            'latinisedTitle': voca.latinise(firstLetter)
                        };
                    }
                    else {
                        if (!_layer.visible) {
                            return;
                        }
                        sortedLayers[firstLetter]['layers'].push(_layer);
                    }
                });

                var reSortedLayers = {};
                if (!angular.equals({}, sortedLayers)) {
                    Object.keys(sortedLayers).sort().reduce(function(acc, key) {
                        if (angular.isDefined(acc)) {
                            reSortedLayers[acc] = sortedLayers[acc];
                        }
                        if (angular.isDefined(key)) {
                            reSortedLayers[key] = sortedLayers[key];
                        }
                    })
                    if (!angular.equals({}, reSortedLayers)) {
                        self.sortedLayers = reSortedLayers;
                    } else {
                        self.sortedLayers = sortedLayers;
                    }
                }
            }

            self.createGroupCatalog = function() {
                var sortedGroups = {};

                angular.forEach(self.catalogGroupNames, function(_group) {
                    self.addCatalogGroup(_group);
                    if(_group.name !== undefined) {
                        self.nameGroupsMap[_group.name] = _group;
                    }
                    if (_group.predefined) {
                        self.addedGroupsName.push(_group.name);
                    }
                    var firstLetter = _group.title.charAt(0).toUpperCase();
                    if (self.firstLettersGroups.indexOf(firstLetter) === -1) {
                        if (!_group.visible) {
                            return;
                        }
                        self.firstLettersGroups.push(firstLetter);
                        sortedGroups[firstLetter] = {
                            'layers':  [_group],
                            'title': firstLetter,
                            'latinisedTitle': voca.latinise(firstLetter)
                        };
                    }
                    else {
                        if (!_group.visible) {
                            return;
                        }
                        sortedGroups[firstLetter]['layers'].push(_group);
                    }
                });
                var reSortedGroups = {};
                if (!angular.equals({}, sortedGroups)) {
                    Object.keys(sortedGroups).sort().reduce(function(acc, key) {
                        if (angular.isDefined(acc)) {
                            reSortedGroups[acc] = sortedGroups[acc];
                        }
                        if (angular.isDefined(key)) {
                            reSortedGroups[key] = sortedGroups[key];
                        }
                    })
                    if (!angular.equals({}, reSortedGroups)) {
                        self.sortedGroups = reSortedGroups;
                    }else {
                        self.sortedGroups = sortedGroups;
                    }
                }
                self.deferred.resolve({
                    'groups': self.sortedGroups,
                    'layers': self.sortedLayers
                });
            }

            $rootScope.$watchCollection(function() {
                return LayersService.layers();
            }, function(newVal, oldVal) {
                self.addedGroupsName = [];
                self.addedLayersName = [];
                angular.forEach(newVal, function(layer) {
                    if (layer.isBackground) {
                        return;
                    }
                    if(layer instanceof anol.layer.Group) {
                        self.addedGroupsName.push(layer.name)
                    } else {
                        self.addedLayersName.push(layer.name)
                    }
                })
            });

        };
        /**
         * @ngdoc method
         * @name getSortedCatalog
         * @methodOf anol.map.CatalogService
         * @description Gets a all layers and sorted
         */
        CatalogService.prototype.getSortedCatalog = function() {
            this.addWaiting();
            return this.deferred.promise;
        };

        /**
         * @ngdoc method
         * @name groupByName
         * @methodOf anol.map.CatalogService
         * @param {string} name
         * @returns {anol.layer.Layer} layer
         * @description Gets a layer by it's name
         */
        CatalogService.prototype.groupByName = function(name) {
            return this.nameGroupsMap[name];
        };
        /**
         * @ngdoc method
         * @name layers
         * @methodOf anol.map.CatalogService
         * @returns {array.<anol.layer.Layer>} All layers
         * @description
         * Get all layers managed by catalog service
         */
        CatalogService.prototype.addedCatalogLayers = function() {
            var self = this;
            return self.addedLayers;
        };
        /**
         * @ngdoc method
         * @name groups
         * @methodOf anol.map.CatalogService
         * @returns {array.<anol.layer.Group>} All layers
         * @description
         * Get all layers managed by catalog service
         */
        CatalogService.prototype.addedCatalogGroups = function() {
            var self = this;
            return self.addedGroups;
        };
                /**
         * @ngdoc method
         * @name setVariant
         * @methodOf anol.map.CatalogService
         * @param {string} variant
         * @description
         * Set variant of catalog service
         */
        CatalogService.prototype.setVariant = function(variant) {
            this.variant = variant;
        };
        /**
         * @ngdoc method
         * @name getVariant
         * @methodOf anol.map.CatalogService
         * @returns {string} Variant
         * @description
         * Get variant of catalog service
         */
        CatalogService.prototype.getVariant = function() {
            var self = this;
            return self.variant;
        };
        /**
         * @ngdoc method
         * @name addLayer
         * @methodOf anol.catalog.CatalogService
         * @param {Object} layer anolLayer
         * @description
         * Adds a layer to catalog
         */
        CatalogService.prototype.addCatalogLayer = function(layer) {
            // all catalog layers must display in layerswitcher
            layer.displayInLayerswitcher = true;
        };
        /**
         * @ngdoc method
         * @name addLayer
         * @methodOf anol.catalog.CatalogService
         * @param {Object} group anolGroup
         * @description
         * Adds a layer to catalog
         */
        CatalogService.prototype.addCatalogGroup = function(group) {
            // all catalog layers must display in layerswitcher
            // layer.displayInLayerswitcher = true;
            this.catalogGroups.push(group);
        };
        /**
         * @ngdoc method
         * @name addGroupToMap
         * @methodOf anol.catalog.CatalogService
         * @param {Object} group anolGroup
         * @description
         * @returns {Promise<anol.layer.Group[]>}
         * Adds a catalog group to map
         */
        CatalogService.prototype.addGroupToMap = async function(groupName, visible) {
            var self = this;
            if(self.addedGroupsName.indexOf(groupName) !== -1) {
                return [];
            }
            var exist = LayersService.groupByName(groupName);
            if (exist) {
                return [];
            }
            self.addWaiting();

            const response = await new Promise((resolve, reject) => {
                var loadUrl = self.loadUrl + '/group/' + groupName;
                $http.get(loadUrl).then(resolve, reject);
            });

            const anolGroups = response.data.groups.map(cGroup => {
                const groupLayers = cGroup.layers
                    .map(cLayer => {
                        cLayer.olLayer.visible = false;
                        if (cLayer['type'] === 'wms') {
                            return new anol.layer.SingleTileWMS(cLayer)
                        } else if (cLayer['type'] === 'tiledwms') {
                            return new anol.layer.TiledWMS(cLayer)
                        } else if (cLayer['type'] === 'wmts') {
                            return new anol.layer.WMTS(cLayer)
                        } else if (cLayer['type'] === 'dynamic_geojson') {
                            return new anol.layer.DynamicGeoJSON(cLayer)
                        } else if (cLayer['type'] === 'static_geojson' || cLayer['type'] === 'digitize') {
                            return new anol.layer.StaticGeoJSON(cLayer)
                        } else {
                            console.error(`Unknown layer type '${cLayer['type']}'`, cLayer);
                        }
                    })
                    .filter(l => l);
                self.addedLayers.push(...groupLayers);

                cGroup.layers = groupLayers;
                const anolGroup = new anol.layer.Group({
                    layers: groupLayers,
                    catalog: cGroup['catalog'],
                    catalogLayer: cGroup['catalogLayer'],
                    showGroup: cGroup['showGroup'],
                    metadataUrl: cGroup['metadataUrl'],
                    abstract: cGroup['abstract'],
                    collapsed: true,
                    singleSelect: cGroup['singleSelect'],
                    singleSelectGroup: cGroup['singleSelectGroup'],
                    name: cGroup['name'],
                    title: cGroup['title'],
                    legend: cGroup['legend'],
                    defaultVisibleLayers: cGroup['defaultVisibleLayers']
                });
                LayersService.addOverlayLayer(anolGroup, 0);
                self.addedGroupsLength = self.addedGroups.reduce((sum, next) => sum + next.layers.length, 0);
                let startZIndex = LayersService.zIndex + self.addedLayers.length;
                for (const layers of anolGroup.layers) {
                    layers.olLayer.setZIndex(startZIndex);
                    startZIndex--;
                }
                self.addedGroupsName.push(groupName);
                self.catalogGroups.push(anolGroup);
                self.addedGroups.push(anolGroup);
                anolGroup.setVisible(visible);
                return anolGroup;
            });
            self.removeWaiting();
            return anolGroups;
        };

        /**
         * @ngdoc method
         * @name loadNamesfromServer
         * @methodOf anol.catalog.CatalogService
         * @param {Object} layer anolLayer
         * @description
         * Adds a catalog layer to map
         */
        CatalogService.prototype.loadNamesfromServer = function(names) {
            var self = this;
            self.addWaiting();
            var defer = $q.defer();
            var data = {
                'names': names
            };
            var loadUrl = this.loadUrl + '/load_names';
            $http.post(loadUrl, data).then(
                function(response) {
                    self.removeWaiting();
                    defer.resolve(response.data);
                }
            )
            return defer.promise;
        };

        /**
         *
         * @ngdoc method
         * @name addToMap
         * @methodOf anol.catalog.CatalogService
         * @param {Object} layer anolLayer
         * @description
         * Adds a catalog layer to map
         */
        CatalogService.prototype.addToMap = function(layerName, visible) {
            var self = this;
            if(self.addedLayersName.indexOf(layerName) !== -1 ) {
                return;
            }
            var alreadyAddedLayer = LayersService.layerByName(layerName);
            if (alreadyAddedLayer) {
                // Even if the layer was already added,
                // we want to update the visibility of that layer.
                alreadyAddedLayer.setVisible(visible);
                return;
            }

            self.addWaiting();
            var loadUrl = this.loadUrl + '/layer/' + layerName;
            $http.get(loadUrl).then(
                function(response) {
                    angular.forEach(response.data.layers, function(clayer) {
                        var anolLayer = undefined;
                        if (clayer['type'] == 'wms') {
                            anolLayer = new anol.layer.SingleTileWMS(clayer)
                        } else if (clayer['type'] == 'tiledwms') {
                            anolLayer = new anol.layer.TiledWMS(clayer)
                        } else if (clayer['type'] == 'wmts') {
                            anolLayer = new anol.layer.WMTS(clayer)
                        } else if (clayer['type'] == 'dynamic_geojson') {
                            anolLayer = new anol.layer.DynamicGeoJSON(clayer)
                        } else if (clayer['type'] == 'static_geojson' || clayer['type'] == 'digitize') {
                            anolLayer = new anol.layer.StaticGeoJSON(clayer)
                        }
                        var added = LayersService.addOverlayLayer(anolLayer, 0);
                        if(anolLayer instanceof anol.layer.DynamicGeoJSON && added === true) {
                            anolLayer.refresh();
                        }
                        self.addedLayersName.push(layerName);
                        self.addedLayers.push(anolLayer);
                        anolLayer.olLayer.setZIndex(LayersService.zIndex + self.addedLayers.length + self.addedGroupsLength)
                        anolLayer.setVisible(visible);
                    });
                    self.removeWaiting();
                }
            )
        };

        /**
         * @ngdoc method
         * @name removeFromMap
         * @methodOf anol.catalog.CatalogService
         * @param {Object} layer anolLayer
         * @description
         * Removes a catalog layer from map
         */
        CatalogService.prototype.removeFromMap = function(layer) {
            var self = this;
            if(layer instanceof anol.layer.Group) {
                var groupIdx = self.addedGroups.indexOf(layer);
                if(self.catalogGroups.indexOf(layer) > -1 && groupIdx > -1) {
                    LayersService.removeOverlayLayer(layer);
                    self.addedGroups.splice(groupIdx, 1);

                    angular.forEach(layer.layers, function(cLayer) {
                        var layerIdx = self.addedLayers.indexOf(cLayer);
                        if(layerIdx > -1) {
                            self.addedLayers.splice(layerIdx, 1);
                        }
                    })

                    // var groupNameIdx = this.addedGroupsName.indexOf(layer.name);
                    // this.addedGroupsName.splice(groupNameIdx, 1)
                }
            } else {
                var layerIdx = this.addedLayers.indexOf(layer);
                if(layerIdx > -1) {
                    layer.setVisible(false);
                    LayersService.removeOverlayLayer(layer);
                    this.addedLayers.splice(layerIdx, 1);

                    // var layerNameIdx = this.addedLayersName.indexOf(layer.name);
                    // this.addedLayersName.splice(layerNameIdx, 1)
                }

                if (layer.anolGroup) {
                    // remove group if it is the last layer
                    var group = layer.anolGroup;
                    if (group.layers.length === 0) {
                        var groupIdx = this.addedGroups.indexOf(group);
                        if(this.catalogGroups.indexOf(group) > -1 && groupIdx > -1) {
                            LayersService.removeOverlayLayer(group);
                            this.addedGroups.splice(groupIdx, 1);

                            // var groupNameIdx = this.addedGroupsName.indexOf(layer.name);
                            // this.addedGroupsName.splice(groupNameIdx, 1);
                        }
                    } else {
                        // important for digitize layers
                        LayersService.removeOverlayLayer(layer);
                    }
                }
            }
        };
        return new CatalogService(_loadUrl);
    }];
}]);
