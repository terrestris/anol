import './module.js';
import Stroke from 'ol/style/Stroke';
import SelectCluster from 'ol-ext/interaction/SelectCluster.js';
import Style from 'ol/style/Style';
import { createEmpty as createEmptyExtent } from 'ol/extent';
import { extend as extendExtent } from 'ol/extent';
angular.module('anol.map')

/**
 * @ngdoc object
 * @name anol.map.ClusterSelectServiceProvider
 */
    .provider('ClusterSelectService', ['LayersServiceProvider', function(LayersServiceProvider) {
        var _clusterServiceInstance;
        var _clusterSelectOptions;
        var _clusterLayers = [];

        LayersServiceProvider.registerAddLayerHandler(function(layer) {
            if(!layer.isClustered()) {
                return;
            }
            if(angular.isDefined(_clusterServiceInstance)) {
                _clusterServiceInstance.addLayer(layer);
            } else {
                _clusterLayers.push(layer);
            }
        });

        LayersServiceProvider.registerRemoveLayerHandler(function(layer) {
            if(!layer.isClustered()) {
                return;
            }
            if(angular.isDefined(_clusterServiceInstance)) {
                _clusterServiceInstance.removeLayer(layer);
            } else {
                var idx = _clusterLayers.indexOf(layer);
                if(idx > -1) {
                    _clusterLayers.splice(idx, 1);
                }
            }
        });

        this.setClusterSelectOptions = function(options) {
            _clusterSelectOptions = options;
        };

        this.$get = ['MapService', function(MapService) {

            var defaultClusterOptions = {
                selectCluster: true,
                pointRadius: 10,
                spiral: true,
                circleMaxObjects: 10,
                maxObjects: 20,
                maxZoomLevel: 18,
                animate: false,
                animationDuration: 500
            };

            var ClusterSelect = function(clusterSelectOptions, clusterLayers) {
                var self = this;
                this.clusterLayers = [];
                this.selectRevealedFeatureCallbacks = [];
                this.clusterSelectOptions = clusterSelectOptions;

                angular.forEach(clusterLayers, function(layer) {
                    self.addLayer(layer);
                });
            };

            ClusterSelect.prototype.registerSelectRevealedFeatureCallback = function(f) {
                this.selectRevealedFeatureCallbacks.push(f);
            };

            ClusterSelect.prototype.handleLayerVisibleChange = function(e, test) {
                this.selectClusterInteraction.clear();
            };

            ClusterSelect.prototype.addLayer = function(layer) {
                var self = this;
                layer.olLayer.on('change:visible', function() {
                    self.handleLayerVisibleChange(self);
                });
                this.clusterLayers.push(layer);
            };

            ClusterSelect.prototype.removeLayer = function(layer) {
                var self = this;
                layer.olLayer.un('change:visible', function() {
                    self.handleLayerVisibleChange(self);
                });
                var idx = this.clusterLayers.indexOf(layer);
                if(idx > -1) {
                    this.clusterLayers.splice(idx, 1);
                    this.selectClusterInteraction.clear();
                }
            };

            ClusterSelect.prototype.layerByFeature = function(feature) {
                var self = this;
                var resultLayer;
                // TODO collect all anol.layer.Feature into a list
                angular.forEach(self.clusterLayers, function(layer) {
                    if(angular.isDefined(resultLayer)) {
                        return;
                    }
                    if(layer.unclusteredSource.getFeatures().indexOf(feature) > -1) {
                        if(layer instanceof anol.layer.DynamicGeoJSON) {
                            if(feature.get('__layer__') === layer.name) {
                                resultLayer = layer;
                            }
                        } else {
                            resultLayer = layer;
                        }
                    }
                });
                return resultLayer;
            };

            ClusterSelect.prototype.getControl = function(recreate) {
                var self = this;

                if(angular.isDefined(self.selectClusterControl) && recreate !== true) {
                    return self.selectClusterControl;
                }

                var interactionOptions = $.extend({}, defaultClusterOptions, this.clusterSelectOptions, {
                    layers: function(layer) {
                        var anolLayers = layer.get('anolLayers') ?? [];
                        return anolLayers.some(l => l.isClustered() && self.clusterLayers.includes(l));
                    },
                    // for each revealed feature of selected cluster, this function is called
                    featureStyle: function(revealedFeature, resolution) {
                        var style = new Style();
                        // style link lines
                        if(revealedFeature.get('selectclusterlink') === true) {
                            style = new Style({
                                stroke: new Stroke({
                                    color: '#f00',
                                    width: 1
                                })
                            });
                        }
                        if(revealedFeature.get('selectclusterfeature') === true) {
                            var originalFeature = revealedFeature.get('features')[0];
                            var layer = self.layerByFeature(originalFeature);
                            var layerStyle = layer.olLayer.getStyle();

                            if(angular.isFunction(layerStyle)) {
                                layerStyle = layerStyle(originalFeature, resolution)[0];
                            }

                            style = layerStyle;
                        }

                        return [style];
                    },
                    style: function(clusterFeature, resolution) {
                        if(clusterFeature.get('features').length === 1) {
                            var layer = self.layerByFeature(clusterFeature.get('features')[0]);
                            var style = layer.olLayer.getStyle();
                            if(angular.isFunction(style)) {
                                style = style(clusterFeature, resolution);
                            }
                            if(angular.isArray(style)) {
                                return style;
                            }
                            return [style];
                        }
                        return [new Style()];
                    }
                });

                var selectedCluster;
                self.selectClusterInteraction = new SelectCluster(interactionOptions);

                var changeCursorCondition = function(pixel) {
                    const features = MapService.getMap().getFeaturesAtPixel(pixel, {
                        layerFilter: layer => layer === self.selectClusterInteraction.overlayLayer_
                    });

                    return features.filter(f => f.get('selectclusterfeature')).length > 0;
                };

                MapService.addCursorPointerCondition(changeCursorCondition);

                self.selectClusterInteraction.on('select', function(a) {
                    if(a.selected.length === 1) {
                        var revealedFeature = a.selected[0];
                        var zoom = MapService.getMap().getView().getZoom();
                        if(revealedFeature.get('features').length > 1 && zoom < interactionOptions.maxZoomLevel) {
                        // zoom in when not all revealed features displayed and max zoom is not reached
                            var _featureExtent = createEmptyExtent();
                            angular.forEach(revealedFeature.get('features'), function(child) {
                                var _childExtent = child.getGeometry().getExtent();
                                extendExtent(_featureExtent, _childExtent);
                            });
                            var view = MapService.getMap().getView();
                            view.fit(_featureExtent, MapService.getMap().getSize());
                            return;
                        }
                        if(revealedFeature.get('selectclusterfeature') === true) {
                        // revealedFeature selected. execute callbacks
                            var originalFeature = revealedFeature.get('features')[0];
                            var layer = self.layerByFeature(originalFeature);
                            angular.forEach(self.selectRevealedFeatureCallbacks, function(f) {
                                f(revealedFeature, originalFeature, layer);
                            });
                            return;
                        }
                        if(revealedFeature.get('features').length > 1) {
                        // cluster with multiple features selected. cluster open
                            if(angular.isDefined(selectedCluster)) {
                                selectedCluster.setStyle(null);
                            }
                            selectedCluster = revealedFeature;
                            selectedCluster.setStyle(new Style());
                            MapService.addCursorPointerCondition(changeCursorCondition);
                            return;
                        }
                        if(revealedFeature.get('features').length === 1) {
                        // cluster with one feature selected. clear selectedCluster style
                            if(angular.isDefined(selectedCluster)) {
                                selectedCluster.setStyle(null);
                                selectedCluster = undefined;
                            }
                        }
                    } else if(a.selected.length === 0 && angular.isDefined(selectedCluster)) {
                    // cluster closed
                        selectedCluster.setStyle(null);
                        selectedCluster = undefined;
                        MapService.removeCursorPointerCondition(changeCursorCondition);
                    }
                });

                self.selectClusterInteraction.getFeatures().on('add', function(e) {
                    var features = e.element.get('features');
                    var layer = self.layerByFeature(features[0]);
                    if(angular.isFunction(layer.clusterOptions.onSelect)) {
                        layer.clusterOptions.onSelect(features);
                    }
                });

                MapService.getMap().addInteraction(self.selectClusterInteraction);

                self.selectClusterControl = new anol.control.Control({
                    subordinate: true,
                    olControl: null,
                    interactions: [self.selectClusterInteraction]
                });


                self.selectClusterControl.onDeactivate(function() {
                    self.selectClusterInteraction.setActive(false);
                    MapService.removeCursorPointerCondition(changeCursorCondition);
                });

                // control active by default
                MapService.addCursorPointerCondition(changeCursorCondition);

                return this.selectClusterControl;
            };
            _clusterServiceInstance = new ClusterSelect(_clusterSelectOptions, _clusterLayers);
            return _clusterServiceInstance;
        }];
    }]);
