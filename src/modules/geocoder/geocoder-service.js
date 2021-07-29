import './module.js';
import WKT from 'ol/format/WKT.js';

angular.module('anol.geocoder')

    /**
     * @ngdoc object
     * @name anol.map.GeocoderServiceProvice
     */
    .provider('GeocoderService', ['LayersServiceProvider', function (LayersServiceProvider) {
        var _configs = [];

        this.setGeocoderConfig = function (config) {
            _configs = _configs.concat(config);
        };

        var addConfig = function (config, type) {
            var found = false;
            angular.forEach(_configs, function (conf) {
                if (conf.name === config.name) {
                    found = true;
                }
            });
            if (!found) {
                config.type = type;
                _configs.push(config);
            }
        };

        var removeConfig = function (config) {
            var removeIdx = undefined;
            angular.forEach(_configs, function (conf, idx) {
                if (conf === config) {
                    removeIdx = idx;
                }
            });

            if (angular.isDefined(removeIdx)) {
                _configs.splice(removeIdx, 1);
            }
        }

        LayersServiceProvider.registerAddLayerHandler(function (layer) {
            if (layer.searchConfig && layer.searchConfig.length > 0) {
                angular.forEach(layer.searchConfig, function (config) {
                    addConfig(config, 'layer');
                });
            }
        });

        LayersServiceProvider.registerRemoveLayerHandler(function (layer) {
            if (layer.searchConfig && layer.searchConfig.length > 0) {
                angular.forEach(layer.searchConfig, function (config) {
                    removeConfig(config);
                });
            }
        });

        this.$get = ['$rootScope', 'MapService', 'UrlMarkerService', function ($rootScope, MapService, UrlMarkerService) {
            /**
             * @ngdoc service
             * @name anol.map.GeocoderService
             *
             */
            class Geocoder {
                constructor(configs) {
                    var self = this;
                    self.configs = configs;
                    self.geocoders = {};
                }

                addConfigs(configs) {
                    for (const config of configs) {
                        this.addConfig(config);
                    }
                    $rootScope.searchConfigsReady = true;
                }

                addConfig(config, type) {
                    var self = this;
                    var found = false;
                    angular.forEach(self.configs, function (conf) {
                        if (conf.name === config.name) {
                            found = true;
                        }
                    });

                    // prevent adding geocoder twice
                    if (found) {
                        return false;
                    }

                    if (angular.isUndefined(type)) {
                        type = 'base';
                    }
                    config.type = type;
                    self.configs.push(config);
                    return true;
                }

                removeConfig(config) {
                    var self = this;
                    angular.forEach(self.configs, function (conf, idx) {
                        if (conf === config) {
                            self.overlayLayers.splice(idx, 1);
                        }
                    });
                }

                getSearchBoxConfigs() {
                    return this.configs.filter(c => c.availableInSearchBox !== false);
                }

                getUrlGeocodeConfigs() {
                    return this.configs.filter(c => c.availableInUrlGeocode === true);
                }

                configByName(name) {
                    return this.configs.filter(c => c.name === name)[0];
                }

                getGeocoder(name) {
                    if (this.geocoders[name] === undefined) {
                        const config = this.configByName(name);
                        if (!config) {
                            throw new Error(`Config with name ${name} not found`);
                        }

                        this.geocoders[name] = new anol.geocoder[config.geocoder](config.geocoderOptions);
                    }

                    return this.geocoders[name];
                }

                parseFeature(result, projection) {
                    const format = new WKT();
                    return format.readFeature(result.wkt, {
                        dataProjection: result.projectionCode,
                        featureProjection: projection
                    });
                }

                async handleUrlGeocode(term, configName, highlight, label) {
                    await new Promise(resolve => {
                        $rootScope.$watch(scope => scope.searchConfigsReady && scope.layersReady, () => {
                            if ($rootScope.searchConfigsReady && $rootScope.layersReady) {
                                resolve();
                            }
                        });
                    });

                    let geocoder;
                    if (angular.isUndefined(configName)) {
                        if (this.getUrlGeocodeConfigs().length > 0) {
                            geocoder = this.getGeocoder(this.getUrlGeocodeConfigs()[0].name);
                        }
                    } else {
                        const config = this.configByName(configName);
                        if (config) {
                            if (!config.availableInUrlGeocode) {
                                console.error('Search config is not available in url geocode (missing `availableInUrlGeocode` configuration).')
                                return;
                            }
                            geocoder = this.getGeocoder(configName);
                        }
                    }

                    if (!geocoder) {
                        console.error('No search config for url gecode available (missing configuration with `availableInUrlGeocode` option).')
                        return;
                    }

                    const results = await geocoder.request(term);

                    if (results.length === 0) {
                        $rootScope.geocodeFailed = true;
                        return;
                    }

                    const proj = MapService.getMap().getView().getProjection();

                    const geometry = this.parseFeature(results[0], proj).getGeometry();

                    if (highlight) {
                        UrlMarkerService.createMarker({
                            geometry,
                            label,
                            fit: true
                        });
                    } else {
                        MapService.zoomToGeom(geometry);
                    }
                }
            }

            return new Geocoder(_configs);
        }];
    }]);
