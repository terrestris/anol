import './module.js';

angular.module('anol.geoeditor')

/**
 * @ngdoc object
 * @name anol.geoeditor.GeoeditorServiceProvider
 */
    .provider('GeoeditorService', ['LayersServiceProvider', function(LayersServiceProvider) {
        var _geoeditorServiceInstance;
        var _editableLayers = [];

        LayersServiceProvider.registerAddLayerHandler(function(layer) {
            if(layer.editable !== true) {
                return;
            }
            if(angular.isDefined(_geoeditorServiceInstance)) {
                _geoeditorServiceInstance.addLayer(layer);
            } else {
                _editableLayers.push(layer);
            }
        });
        this.$get = [function() {
            /**
             * @ngdoc service
             * @name anol.geoeditor.GeoeditorService
             *
             * @description
             * Handles current draw layer
             */
            var GeoeditorService = function(editableLayers) {
                var self = this;
                this.layers = [];
                this.activeLayer = undefined;
                angular.forEach(editableLayers, function(layer) {
                    self.addLayer(layer);
                });
            };
            /**
             * @ngdoc method
             * @name addLayer
             * @methodOf anol.geoeditor.GeoeditorService
             * @param {Object} layer anolLayer
             * @description
             * Adds a draw layer
             */
            GeoeditorService.prototype.addLayer = function(layer) {
                this.layers.push(layer);
            };
            /**
             * @ngdoc method
             * @name changeLayer
             * @methodOf anol.geoeditor.geoeditorService
             * @param {Object} layer anolLayer to draw on. undefined to deactivate drawing
             * @description
             * Sets current draw layer
             */
            GeoeditorService.prototype.changeLayer = function(layer) {
                if(angular.isUndefined(layer) || this.layers.indexOf(layer) !== -1) {
                    this.activeLayer = layer;
                }
            };

            /**
             * @ngdoc method
             * @name countFeaturesFor
             * @methodOf anol.geoeditor.geoeditorService
             * @param {String} geometryType Geometry type (e.g. 'Point', 'LineString')
             * @description
             * Counts the features in this.activeLayer for the given geometry type.
             */
            GeoeditorService.prototype.countFeaturesFor = function(geometryType) {
                if (angular.isUndefined(this.activeLayer) || angular.isUndefined(geometryType)) {
                    return;
                }

                var features = this.activeLayer.olLayer.getSource().getFeatures();
                return features.filter(function(feature) {
                    return geometryType === feature.getGeometry().getType();
                }).length;
            };

            return new GeoeditorService(_editableLayers);
        }];
    }]);
