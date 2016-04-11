angular.module('anol.map')

/**
 * @ngdoc directive
 * @name anol.map.directive:anolMap
 *
 * @requires $timeout
 * @requires anol.DefaultMapName
 * @requires anol.map.MapService
 *
 * @description
 * The anol-map directive adds the map defined in MapService to the dom.
 *
 * It also add the DefaultMapName as id and class to the map element.
 */
.directive('anolMap', ['$timeout', 'DefaultMapName', 'MapService', 'LayersService', 'ControlsService', 'InteractionsService',
    function($timeout, DefaultMapName, MapService, LayersService, ControlsService, InteractionsService) {
    return {
        scope: {},
        link: {
            pre: function(scope, element, attrs) {
                scope.mapName = DefaultMapName;
                scope.map = MapService.getMap();
                element
                    .attr('id', scope.mapName)
                    .addClass(scope.mapName);

                scope.map.setTarget(document.getElementById(scope.mapName));
                scope.olLayers = [];
            },
            post: function(scope, element, attrs) {
                $timeout(function() {
                    scope.map.updateSize();
                    // add layers after map has correct size to prevent
                    // loading layer twice (before and after resize)
                    angular.forEach(LayersService.backgroundLayers, function(layer) {
                        scope.map.addLayer(layer.olLayer);
                    });
                    angular.forEach(LayersService.overlayLayers, function(layer) {
                        if(layer instanceof anol.layer.Group) {
                            angular.forEach(layer.layers.slice().reverse(), function(grouppedLayer) {
                                if(scope.olLayers.indexOf(grouppedLayer.olLayer) < 0) {
                                    scope.map.addLayer(grouppedLayer.olLayer);
                                    scope.olLayers.push(grouppedLayer.olLayer);
                                }
                            });
                        } else {
                            if(scope.olLayers.indexOf(layer.olLayer) < 0) {
                                scope.map.addLayer(layer.olLayer);
                                scope.olLayers.push(layer.olLayer);
                            }
                        }
                    });
                    angular.forEach(LayersService.systemLayers, function(layer) {
                        scope.map.addLayer(layer.olLayer);
                    });
                    LayersService.registerMap(scope.map);
                    // add registered controls and interactions
                    angular.forEach(ControlsService.olControls, function(control) {
                        scope.map.addControl(control);
                    });
                    ControlsService.registerMap(scope.map);
                    angular.forEach(InteractionsService.interactions, function(interaction) {
                        scope.map.addInteraction(interaction);
                    });
                    InteractionsService.registerMap(scope.map);
                });
            }
        },
        controller: function($scope, $element, $attrs) {
            this.getMap = function() {
                return $scope.map;
            };
        }
    };
}]);
