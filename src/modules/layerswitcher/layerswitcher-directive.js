import './module.js';

import templateHTML from './templates/layerswitcher.html';

angular.module('anol.layerswitcher')

    /**
     * @ngdoc directive
     * @name anol.layerswitcher.directive:anolLayerswitcher
     *
     * @restrict A
     * @requires anol.map.LayersService
     * @requires anol.map.ControlsService
     *
     * @param {string} anolLayerswitcher If containing "open" layerswitcher initial state is expanded. Otherweise it is collapsed.
     * @param {string} tooltipPlacement Position of tooltip
     * @param {number} tooltipDelay Time in milisecounds to wait before display tooltip
     * @param {boolean} tooltipEnable Enable tooltips. Default true for non-touch screens, default false for touchscreens
     * @param {string} templateUrl Url to template to use instead of default one
     *
     * @description
     * Shows/hides background- and overlaylayer
     */
    // TODO handle add / remove layer
    // TODO handle edit layers title
    .directive('anolLayerswitcher', ['$timeout', '$templateRequest', '$compile', 'LayersService', 'ControlsService', 'MapService', 'CatalogService',
        function ($timeout, $templateRequest, $compile, LayersService, ControlsService, MapService, CatalogService) {
            return {
                restrict: 'A',
                require: '?^anolMap',
                transclude: true,
                template: function (tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return templateHTML;
                },
                scope: {
                    anolLayerswitcher: '@anolLayerswitcher',
                    removeLayerEnabled: '=',
                    tooltipPlacement: '@',
                    tooltipDelay: '@',
                    tooltipEnable: '@'
                },
                link: {
                    pre: function (scope, element, attrs, AnolMapController) {
                        if (attrs.templateUrl && attrs.templateUrl !== '') {
                            $templateRequest(attrs.templateUrl).then(function (html) {
                                const template = angular.element(html);
                                element.html(template);
                                $compile(template)(scope);
                            });
                        }
                        scope.collapsed = false;
                        scope.showToggle = false;
                        if (angular.isDefined(scope.$parent.hideMetadata)) {
                            scope.hideMetadata = scope.$parent.hideMetadata;
                        } else {
                            scope.hideMetadata = false;
                        }
                        // attribute defaults
                        scope.tooltipPlacement = angular.isDefined(scope.tooltipPlacement) ?
                            scope.tooltipPlacement : 'left';
                        scope.tooltipDelay = angular.isDefined(scope.tooltipDelay) ?
                            scope.tooltipDelay : 500;
                        scope.tooltipEnable = angular.isDefined(scope.tooltipEnable) ?
                            scope.tooltipEnable : !('ontouchstart' in window);

                        scope.backgroundLayers = LayersService.backgroundLayers;
                        scope.overlayLayers = LayersService.overlayLayers;
                        if (angular.isObject(AnolMapController)) {
                            scope.collapsed = scope.anolLayerswitcher !== 'open';
                            scope.showToggle = true;
                            ControlsService.addControl(
                                new anol.control.Control({
                                    element: element
                                })
                            );
                        }
                    },
                    post: function (scope, element, attrs) {
                        scope.backgroundLayer = LayersService.activeBackgroundLayer();
                        scope.$watch('backgroundLayer', function (newVal, oldVal) {
                            if (angular.isDefined(oldVal)) {
                                oldVal.setVisible(false);
                            }
                            if (angular.isDefined(newVal)) {
                                newVal.setVisible(true);
                            }
                        });
                        MapService.getMap().getLayers().on('add', function () {
                            scope.overlayLayers = LayersService.overlayLayers;
                        });
                    }
                },
                controller: function ($scope, $element, $attrs) {
                    $scope.sortableGroups = {
                        'delay': 100,
                        'update': function (e, ui) {
                            $timeout(function () {
                                LayersService.reorderGroupLayers();
                            });
                        }
                    };
                    $scope.sortableLayer = {
                        'delay': 100,
                        'update': function (e, ui) {
                            $timeout(function () {
                                LayersService.reorderOverlayLayers();
                            });
                        }
                    };
                    $scope.isGroup = function (toTest) {
                        return toTest instanceof anol.layer.Group;
                    };
                    $scope.zoomToLayerExtent = function (layer) {
                        if (!(layer instanceof anol.layer.Feature)) {
                            return;
                        }
                        const extent = layer.extent();
                        if (extent === false) {
                            return;
                        }
                        const map = MapService.getMap();
                        map.getView().fit(extent, map.getSize());
                    };
                    $scope.setBackgroundLayerByName = function (name) {
                        $scope.backgroundLayer = LayersService.layerByName(name);
                    };
                    $scope.removeBackgroundLayer = function () {
                        $scope.backgroundLayer = undefined;
                    };
                    $scope.layerByName = function (name) {
                        return LayersService.layerByName(name);
                    };
                    $scope.layerIsVisibleByName = function (name) {
                        const layer = LayersService.layerByName(name);
                        if (angular.isDefined(layer)) {
                            return layer.getVisible();
                        }
                        return false;
                    };

                    $scope.toggleLayerVisibleByName = function (name) {
                        var layer = LayersService.layerByName(name);
                        if (angular.isDefined(layer)) {
                            if (layer.anolGroup && layer.anolGroup.singleSelectGroup) {
                                const groupName = layer.anolGroup.name;
                                angular.forEach(LayersService.nameGroupsMap, function (xGroup, xName) {
                                    if (xName !== groupName) {
                                        xGroup.setVisible(false);
                                    }
                                });
                            }
                            layer.setVisible(!layer.getVisible());
                        }
                    };

                    $scope.toggleGroupVisibleByName = function (name) {
                        const group = LayersService.groupByName(name);
                        if (angular.isDefined(group)) {
                            if (group.singleSelectGroup && !group.getVisible()) {
                                angular.forEach(LayersService.nameGroupsMap, function (xGroup, xName) {
                                    if (xName !== name) {
                                        xGroup.setVisible(false);
                                    }
                                });
                            }
                            // group.hideTransparencySliders();
                            group.setVisible(!group.getVisible());
                        }
                    };
                    $scope.groupIsVisibleByName = function (name) {
                        var group = LayersService.groupByName(name);
                        if (angular.isDefined(group)) {
                            return group.getVisible();
                        }
                        return false;
                    };
                    $scope.removeLayer = function (layer) {
                        if (layer.catalogLayer || layer.catalog) {
                            CatalogService.removeFromMap(layer);
                        } else {
                            LayersService.removeOverlayLayer(layer);
                        }
                    };

                    /* $scope.toggleConfig = function (layer) {
                        layer.setConfigVisible(!layer.isConfigVisible());
                    } */
                }
            };
        }]);
