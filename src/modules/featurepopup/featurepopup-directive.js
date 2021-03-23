import './module.js';
import '../util';
import Overlay from 'ol/Overlay';
import Cluster from 'ol/source/Cluster';
import { unByKey } from 'ol/Observable';

// TODO rename to popup
angular.module('anol.featurepopup')
/**
 * @ngdoc directive
 * @name anol.featurepopup.directive:anolFeaturePopup
 *
 * @restrict A
 *
 * @param {string} templateUrl Url to template to use instead of default one
 * @param {anol.layer.Feature} layers Layers to show popup for
 * @param {number} tolerance Click tolerance in pixel
 * @param {object} openFor Accepts an object with layer and feature property. If changed, a popup is shown for given value
 * @param {string} openingDirection Direction where the popup open. Default is top. Also the values left, bottom and right are possible
 * @param {number} autoPanMargin Popup margin to map border for auto pan
 *
 * @description
 * Shows a popup for selected feature
 */
    .directive('anolFeaturePopup', ['$templateRequest', '$compile','$window', '$timeout', '$olOn', 'MapService', 'LayersService', 'ControlsService', 'PopupsService',
        function($templateRequest, $compile, $window, $timeout, $olOn, MapService, LayersService, ControlsService, PopupsService) {
            // TODO use for all css values
            var cssToFloat = function(v) {
                return parseFloat(v.replace(/[^-\d\.]/g, ''));
            };

            return {
                restrict: 'A',
                scope: {
                    'layers': '=?',
                    'excludeLayers': '=?',
                    'tolerance': '=?',
                    'openFor': '=?',
                    'openingDirection': '@',
                    'onClose': '&?',
                    'coordinate': '=?',
                    'offset': '=?',
                    'closeOnZoom': '=?',
                    'containerId': '@?',
                    'altMobileFullscreen': '<?',
                    '_autoPanMargin': '=autoPanMargin',
                    '_popupFlagSize': '=popupFlagSize',
                    '_mobileFullscreen': '=mobileFullscreen',
                    '_autoPanOnSizeChange': '=autoPanOnSizeChange',
                    '_allowDrag': '=allowDrag'
                },
                replace: true,
                transclude: true,
                template: function(tElement, tAttrs) {
                    if (tAttrs.templateUrl) {
                        return '<div></div>';
                    }
                    return require('./templates/popup.html');
                },
                link: function(scope, element, attrs) {
                    if (attrs.templateUrl && attrs.templateUrl !== '') {
                        $templateRequest(attrs.templateUrl).then(function(html){
                            var template = angular.element(html);
                            element.html(template);
                            $compile(template)(scope);
                        });
                    }
                    var self = this;
                    var singleClickListenerKey = undefined;
                    PopupsService.register(scope);
                    var multiselect = angular.isDefined(attrs.multiselect);

                    scope.sticky = angular.isDefined(attrs.sticky);
                    scope.openingDirection = scope.openingDirection || 'top';
                    scope.map = MapService.getMap();
                    scope.isVisible = false;

                    scope.feature = undefined;
                    scope.layer = undefined;
                    scope.selects = {};

                    scope.tolerance = angular.isDefined(scope.tolerance) ? scope.tolerance : 10
                    scope.autoPanMargin = angular.isDefined(scope._autoPanMargin) ? scope._autoPanMargin : 20;
                    scope.popupFlagSize = angular.isDefined(scope._popupFlagSize) ? scope._popupFlagSize : 15;
                    scope.mobileFullscreen = angular.isDefined(scope._mobileFullscreen) ? scope._mobileFullscreen : false;
                    scope.autoPanOnSizeChange = angular.isDefined(scope._autoPanOnSizeChange) ? scope._autoPanOnSizeChange : false;
                    scope.allowDrag = angular.isDefined(scope._allowDrag) ? scope._allowDrag : false;
                    if(angular.isUndefined(scope.layers)) {
                        scope.layers = [];
                        scope.$watchCollection(function() {
                            return LayersService.flattedLayers();
                        }, function(layers) {
                            scope.layers.length = 0;
                            angular.forEach(layers, function(layer) {
                                if(!(layer instanceof anol.layer.Feature)) {
                                    return;
                                }
                                if(angular.isDefined(scope.excludeLayers) && scope.excludeLayers.indexOf(layer) > -1) {
                                    return;
                                }
                                scope.layers.push(layer);
                            });
                        });
                    }

                    const overlayElement = element.find('.anol-popup:first')
                    if (angular.isDefined(attrs.class)) {
                        scope.class = attrs.class;
                    }

                    scope.overlayOptions = {
                        element: overlayElement[0],
                        autoPan: true,
                        autoPanAnimation: {
                            duration: 250
                        },
                        autoPanMargin: scope.autoPanMargin
                    };

                    if(angular.isDefined(scope.coordinate)) {
                        scope.overlayOptions.position = scope.coordinate;
                    }
                    if(angular.isDefined(scope.offset)) {
                        scope.overlayOptions.offset = scope.offset;
                    }

                    if (angular.isDefined(scope.closeOnZoom)) {
                        scope.map.getView().on('change:resolution', function() {
                            scope.coordinate = undefined;
                        }, this);
                    }

                    scope.popup = new Overlay(scope.overlayOptions);
                    scope.map.addOverlay(scope.popup);

                    overlayElement.parent().addClass('anol-popup-container');
                    if(scope.mobileFullscreen === true) {
                        element.parent().addClass('mobile-fullscreen');
                    }

                    if(scope.sticky) {
                        return;
                    }

                    var updateOffset = function(featureLayerList) {
                        if(angular.isDefined(scope.offset)) {
                            return;
                        }
                        var offset = [0, 0];
                        angular.forEach(featureLayerList, function(v) {
                            var feature = v[0];
                            var layer = v[1];
                            var style = feature.getStyle();
                            if(style === null) {
                                style = layer.getStyle();
                            }
                            if(angular.isFunction(style)) {
                                style = style(feature, scope.map.getView().getResolution())[0];
                            }
                            var image = style.getImage();
                            // only ol.Style.Icons (subclass of ol.Style.Image) have getSize function
                            if(image !== null && angular.isFunction(image.getSize)) {
                                var size = image.getSize();
                                switch(scope.openingDirection) {
                                case 'top':
                                    offset[1] = Math.min(offset[1], size[1] / -2);
                                    break;
                                case 'bottom':
                                    offset[1] = Math.min(offset[1], size[1] / 2);
                                    break;
                                case 'left':
                                    offset[0] = Math.min(offset[0], size[0] / -2);
                                    break;
                                case 'right':
                                    offset[0] = Math.min(offset[0], size[0] / 2);
                                    break;
                                }
                            }
                        });
                        scope.popup.setOffset(offset);
                    };

                    var handleClick = function(evt) {
                        var featureLayerList = [];
                        var olLayers = scope.layers.map(function (l) { return l.olLayer; });

                        scope.map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
                            if(layer.getSource() instanceof Cluster) {
                                // set to original feature when clicked on clustered feature containing one feature
                                if(feature.get('features').length === 1) {
                                    feature = feature.get('features')[0];
                                } else {
                                    return;
                                }
                            }

                            featureLayerList.push([feature, layer]);
                        }, {
                            layerFilter: function (layer) {
                                return layer.getVisible() && olLayers.indexOf(layer) > -1;
                            },
                            hitTolerance: scope.tolerance
                        });

                        if(featureLayerList.length > 0) {
                            if (multiselect) {
                                scope.selects = {};
                                featureLayerList.forEach(function (featureAndLayer) {
                                    var anolLayer = featureAndLayer[1].get('anolLayer');
                                    if(angular.isUndefined(scope.selects[anolLayer.name])) {
                                        scope.selects[anolLayer.name] = {
                                            layer: anolLayer,
                                            features: []
                                        };
                                    }
                                    scope.selects[anolLayer.name].features.push(featureAndLayer[0]);
                                });
                            } else {
                                scope.layer = featureLayerList[0][1].get('anolLayer');
                                scope.feature = featureLayerList[0][0];
                            }
                            scope.coordinate = evt.coordinate;
                        } else {
                            // the watcher for scope.coordinate will reset scope.selects, scope.layer and scope.feature
                            scope.coordinate = undefined;
                        }
                        updateOffset(featureLayerList);
                    };

                    var changeCursorCondition = function(pixel) {
                        const olLayers = scope.layers.map(function (l) { return l.olLayer; });
                        return scope.map.hasFeatureAtPixel(pixel, {
                            layerFilter: function (layer) {
                                return layer.getVisible() && olLayers.indexOf(layer) > -1;
                            },
                            hitTolerance: scope.tolerance
                        });
                    };

                    var bindCursorChange = function() {
                        if(angular.isUndefined(scope.layers) || scope.layers.length === 0) {
                            MapService.removeCursorPointerCondition(changeCursorCondition);
                        } else if(angular.isDefined(scope.layers) && scope.layers.length !== 0) {
                            MapService.addCursorPointerCondition(changeCursorCondition);
                        }
                    };

                    var callCloseCallbackOnReopen = function () {
                        if (angular.isDefined(scope.coordinate) && angular.isDefined(scope.onClose)) {
                            scope.onClose({ layer: scope.layer, feature: scope.feature });
                        }
                    }

                    var control = new anol.control.Control({
                        subordinate: true,
                        olControl: null
                    });
                    control.onActivate(function() {
                        singleClickListenerKey = $olOn(scope.map, 'singleclick', handleClick.bind(self));
                        MapService.addCursorPointerCondition(changeCursorCondition);
                    });
                    control.onDeactivate(function() {
                        unByKey(singleClickListenerKey);
                        MapService.removeCursorPointerCondition(changeCursorCondition);
                    });

                    scope.$watch('layers', function(n, o) {
                        if(angular.equals(n, o)) {
                            return;
                        }
                        scope.coordinate = undefined;
                    });

                    control.activate();

                    ControlsService.addControl(control);

                    scope.$watch('layers', bindCursorChange);
                    scope.$watch('coordinate', function(coordinate) {
                        scope.isVisible = angular.isDefined(coordinate);
                        if(angular.isUndefined(coordinate)) {
                            scope.selects = {};
                            if(angular.isFunction(scope.onClose)) {
                                scope.onClose({ layer: scope.layer, feature: scope.feature })
                            }
                            scope.layer = undefined;
                            scope.feature = undefined;
                        }
                        else if (scope.mobileFullscreen === true && $window.innerWidth >= 480) {
                            var xPadding = parseInt(element.css('padding-left').replace(/[^-\d\.]/g, ''));
                            xPadding += parseInt(element.css('padding-right').replace(/[^-\d\.]/g, ''));
                            var yPadding = parseInt(element.css('padding-top').replace(/[^-\d\.]/g, ''));
                            yPadding += parseInt(element.css('padding-bottom').replace(/[^-\d\.]/g, ''));
                            var mapElement = $(scope.map.getTargetElement());
                            var maxWidth = mapElement.width() - (scope.autoPanMargin * 2) - xPadding;
                            var maxHeight = mapElement.height() - (scope.autoPanMargin * 2) - yPadding;
                            if(scope.openingDirection === 'top' || scope.openingDirection === 'bottom') {
                                maxHeight -= scope.popupFlagSize;
                            } else {
                                maxWidth -= scope.popupFlagSize;
                            }
                            var content = element.find('.anol-popup-content').children();
                            if(content.length > 0) {
                                var target = content.first();
                                target.css('max-width', maxWidth + 'px');
                                target.css('max-height', maxHeight + 'px');
                            }
                        }
                        $timeout(function() {
                            overlayElement.css('height', 'auto')
                            overlayElement.css('width', 'auto')
                            scope.popup.setPosition(coordinate);
                        });
                    });
                    scope.$watch('openFor', function(openFor) {

                        if(angular.isDefined(openFor)) {
                            if('coordinate' in openFor) {
                                if (angular.isDefined(openFor.coordinate)) {
                                    callCloseCallbackOnReopen();
                                }
                                scope.coordinate = openFor.coordinate;
                            } else if (angular.isDefined(openFor.feature)) {
                                callCloseCallbackOnReopen();
                                scope.coordinate = openFor.feature.getGeometry().getLastCoordinate();
                            }

                            scope.layer = openFor.layer;
                            scope.feature = openFor.feature;

                            if(angular.isDefined(openFor.content)) {
                                overlayElement.find('.anol-popup-content').empty().append(openFor.content);
                                if (scope.altMobileFullscreen) {
                                    element.find('.anol-popup-content').empty().append(openFor.content.clone());
                                }
                            }
                            scope.openFor = undefined;
                        }
                    });

                    if(scope.autoPanOnSizeChange === true) {
                        scope.$watchCollection(function() {
                            return {
                                w: overlayElement.width(),
                                h: overlayElement.height()
                            };
                        }, function() {
                            scope.popup.setPosition(undefined);
                            scope.popup.setPosition(scope.coordinate);
                        });
                    }
                    scope.makeDraggable = function(event) {
                        if(scope.allowDrag === false) {
                            return;
                        }
                        var y = cssToFloat(overlayElement.parent().css('top')) + cssToFloat(overlayElement.css('top'));
                        var x = cssToFloat(overlayElement.parent().css('left')) + cssToFloat(overlayElement.css('left'));

                        PopupsService.makeDraggable(scope, [x, y], scope.feature, scope.layer, scope.selects, event);
                    };
                },
                controller: function($scope) {
                    this.close = function() {
                        if(angular.isDefined($scope.coordinate)) {
                            $scope.coordinate = undefined;
                        }
                    };
                    $scope.close = this.close;
                }
            };
        }]);
